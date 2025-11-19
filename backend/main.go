package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// Monitor represents a monitored target and its latest state.
type Monitor struct {
	ID                 uint      `json:"id" gorm:"primaryKey"`
	Name               string    `json:"name" gorm:"not null"`
	Type               string    `json:"type" gorm:"not null"`
	URL                string    `json:"url" gorm:"not null"`
	Status             string    `json:"status" gorm:"not null;default:UNKNOWN"`
	LastCheck          time.Time `json:"last_check"`
	LastResponseCode   int       `json:"last_response_code"`
	LastResponseTimeMs int       `json:"last_response_time_ms"`
}

// monitorCreateRequest captures required data for creating a monitor.
type monitorCreateRequest struct {
	Name string `json:"name" binding:"required"`
	Type string `json:"type" binding:"required"`
	URL  string `json:"url" binding:"required"`
}

// monitorUpdateRequest captures fields that can be updated for a monitor.
type monitorUpdateRequest struct {
	Name *string `json:"name"`
	Type *string `json:"type"`
	URL  *string `json:"url"`
}

const (
	statusHealthy   = "HEALTHY"
	statusDegraded  = "DEGRADED"
	statusUnhealthy = "UNHEALTHY"
	statusUnknown   = "UNKNOWN"
)

type monitorChecker struct {
	db     *gorm.DB
	client *http.Client
}

func newMonitorChecker(db *gorm.DB) *monitorChecker {
	return &monitorChecker{
		db:     db,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (mc *monitorChecker) start(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				mc.runBatch(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (mc *monitorChecker) runBatch(ctx context.Context) {
	var monitors []Monitor
	if err := mc.db.Find(&monitors).Error; err != nil {
		log.Printf("monitor batch query failed: %v", err)
		return
	}
	for _, m := range monitors {
		monitor := m
		go mc.checkMonitor(ctx, &monitor)
	}
}

func (mc *monitorChecker) triggerCheck(id uint) {
	go func() {
		var monitor Monitor
		if err := mc.db.First(&monitor, id).Error; err != nil {
			log.Printf("monitor trigger failed for id=%d: %v", id, err)
			return
		}
		mc.checkMonitor(context.Background(), &monitor)
	}()
}

func (mc *monitorChecker) checkMonitor(ctx context.Context, monitor *Monitor) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, monitor.URL, nil)
	if err != nil {
		log.Printf("failed to build request for monitor %d: %v", monitor.ID, err)
		return
	}
	start := time.Now()
	status := statusUnhealthy
	code := 0
	latency := 0
	resp, err := mc.client.Do(req)
	if err != nil {
		log.Printf("monitor %d request failed: %v", monitor.ID, err)
	} else {
		code = resp.StatusCode
		latency = int(time.Since(start) / time.Millisecond)
		resp.Body.Close()
		status = deriveStatusFromCode(code)
	}
	update := map[string]interface{}{
		"status":                status,
		"last_check":            time.Now(),
		"last_response_code":    code,
		"last_response_time_ms": latency,
	}
	if err := mc.db.Model(&Monitor{}).Where("id = ?", monitor.ID).Updates(update).Error; err != nil {
		log.Printf("monitor %d update failed: %v", monitor.ID, err)
	}
}

func deriveStatusFromCode(code int) string {
	switch {
	case code >= 200 && code < 400:
		return statusHealthy
	case code >= 400 && code < 500:
		return statusDegraded
	case code == 0:
		return statusUnhealthy
	default:
		return statusUnhealthy
	}
}

func main() {
	_ = godotenv.Load()

	readKey := strings.TrimSpace(getEnv("READ_KEY"))
	adminKey := strings.TrimSpace(getEnv("ADMIN_KEY"))

	if readKey == "" || adminKey == "" {
		log.Fatal("READ_KEY and ADMIN_KEY must be provided via environment variables")
	}

	db, err := gorm.Open(sqlite.Open("monitors.db"), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	if err := db.AutoMigrate(&Monitor{}); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	checker := newMonitorChecker(db)
	interval := time.Duration(getEnvAsInt("CHECK_INTERVAL_SECONDS", 30)) * time.Second
	checker.start(context.Background(), interval)

	router := gin.Default()

	router.GET("/monitor", authorize(readKey, adminKey, true), func(c *gin.Context) {
		var monitors []Monitor
		if err := db.Order("id asc").Find(&monitors).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch monitors"})
			return
		}
		c.JSON(http.StatusOK, monitors)
	})

	router.POST("/monitor", authorize(readKey, adminKey, false), func(c *gin.Context) {
		var req monitorCreateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
			return
		}

		name := strings.TrimSpace(req.Name)
		typeValue := strings.TrimSpace(req.Type)
		urlValue := strings.TrimSpace(req.URL)
		if name == "" || typeValue == "" || urlValue == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Name, type, and url are required"})
			return
		}
		if err := validateURL(urlValue); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid URL"})
			return
		}

		monitor := Monitor{
			Name:   name,
			Type:   typeValue,
			URL:    urlValue,
			Status: statusUnknown,
		}

		if err := db.Create(&monitor).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create monitor"})
			return
		}

		checker.triggerCheck(monitor.ID)

		c.JSON(http.StatusCreated, monitor)
	})

	router.PUT("/monitor/:id", authorize(readKey, adminKey, false), func(c *gin.Context) {
		var req monitorUpdateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
			return
		}

		var monitor Monitor
		if err := db.First(&monitor, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Monitor not found"})
			return
		}

		if req.Name != nil {
			name := strings.TrimSpace(*req.Name)
			if name == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Name cannot be empty"})
				return
			}
			monitor.Name = name
		}
		if req.Type != nil {
			typeValue := strings.TrimSpace(*req.Type)
			if typeValue == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Type cannot be empty"})
				return
			}
			monitor.Type = typeValue
		}
		if req.URL != nil {
			urlValue := strings.TrimSpace(*req.URL)
			if urlValue == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "URL cannot be empty"})
				return
			}
			if err := validateURL(urlValue); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid URL"})
				return
			}
			monitor.URL = urlValue
		}

		if err := db.Save(&monitor).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update monitor"})
			return
		}

		checker.triggerCheck(monitor.ID)

		c.JSON(http.StatusOK, monitor)
	})

	router.DELETE("/monitor/:id", authorize(readKey, adminKey, false), func(c *gin.Context) {
		if err := db.Delete(&Monitor{}, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to delete monitor"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Monitor deleted"})
	})

	router.GET("/status", authorize(readKey, adminKey, true), func(c *gin.Context) {
		var monitors []Monitor
		if err := db.Find(&monitors).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch status"})
			return
		}

		healthy := 0
		degraded := 0
		unknown := 0
		for _, m := range monitors {
			switch strings.ToUpper(m.Status) {
			case statusHealthy:
				healthy++
			case statusDegraded:
				degraded++
			case statusUnknown:
				unknown++
			}
		}

		statusValue := statusUnknown
		if len(monitors) == 0 {
			statusValue = statusUnknown
		} else if healthy == len(monitors) {
			statusValue = statusHealthy
		} else if healthy == 0 && degraded == 0 && unknown == len(monitors) {
			statusValue = statusUnknown
		} else if healthy == 0 && degraded == 0 {
			statusValue = statusUnhealthy
		} else {
			statusValue = statusDegraded
		}

		c.JSON(http.StatusOK, gin.H{
			"status":           statusValue,
			"monitors":         len(monitors),
			"healthy_monitors": healthy,
		})
	})

	if err := router.Run(); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}

// authorize returns middleware enforcing key-based access control.
func authorize(readKey, adminKey string, allowRead bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := strings.TrimSpace(c.GetHeader("Authorization"))
		if key == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Authorization header required"})
			c.Abort()
			return
		}

		if key == adminKey {
			c.Next()
			return
		}

		if allowRead && key == readKey {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, gin.H{"message": "Forbidden"})
		c.Abort()
	}
}

// getEnv wraps lookup to simplify testing and defaults.
func getEnv(key string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return ""
}

func getEnvAsInt(key string, fallback int) int {
	value := strings.TrimSpace(getEnv(key))
	if value == "" {
		return fallback
	}
	if parsed, err := strconv.Atoi(value); err == nil {
		return parsed
	}
	return fallback
}

func validateURL(raw string) error {
	_, err := url.ParseRequestURI(raw)
	return err
}
