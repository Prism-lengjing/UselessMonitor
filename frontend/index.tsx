import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types & Data ---

type Status = 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';
type Lang = 'en' | 'zh';

interface Service {
  id: string;
  name: string;
  status: Status;
  latency: number;
  uptime: number;
  region: string; // Maps to API 'type'
  url?: string;
  lastCheck?: string;
  responseCode?: number;
}

interface LogEntry {
  timestamp: string;
  message: { en: string; zh: string };
  type: 'INFO' | 'WARN' | 'CRIT';
}

interface AppConfig {
  apiBase: string;
  readKey: string;
}

const INITIAL_SERVICES: Service[] = [
  { id: '1', name: 'CORE_GATEWAY', status: 'OPERATIONAL', latency: 24, uptime: 99.99, region: 'US-EAST', url: 'https://alpha.example.com', lastCheck: new Date().toISOString(), responseCode: 200 },
  { id: '2', name: 'NEURAL_DB_SHARD_01', status: 'OPERATIONAL', latency: 12, uptime: 99.95, region: 'US-WEST', url: 'https://neural.example.com', lastCheck: new Date().toISOString(), responseCode: 200 },
  { id: '3', name: 'AUTH_MATRIX', status: 'DEGRADED', latency: 154, uptime: 98.50, region: 'EU-CENTRAL', url: 'https://auth.example.com', lastCheck: new Date().toISOString(), responseCode: 429 },
  { id: '4', name: 'QUANTUM_STORAGE', status: 'OPERATIONAL', latency: 45, uptime: 99.99, region: 'ASIA-PAC', url: 'https://quantum.example.com', lastCheck: new Date().toISOString(), responseCode: 200 },
  { id: '5', name: 'RENDER_FARM_ALPHA', status: 'OFFLINE', latency: 0, uptime: 85.20, region: 'US-EAST', url: 'https://render.example.com', lastCheck: new Date().toISOString(), responseCode: 503 },
  { id: '6', name: 'EVENT_STREAM_BUS', status: 'OPERATIONAL', latency: 8, uptime: 99.99, region: 'GLOBAL', url: 'https://events.example.com', lastCheck: new Date().toISOString(), responseCode: 200 },
];

// --- I18n Dictionary ---

const DICTIONARY = {
  en: {
    title: 'SYSTEM_STATUS',
    subtitle: 'INTERSTELLAR LINK MONITORING',
    integrity: 'SYSTEM INTEGRITY',
    latency: 'LATENCY',
    uptime: 'UPTIME',
    region: 'REGION',
    load: 'LOAD',
    id: 'ID',
    events: 'SYSTEM_EVENT_STREAM',
    autoScroll: 'AUTO_SCROLL',
    live: 'LIVE',
    secure: 'SECURE CONNECTION',
    node: 'NODE',
    coords: 'COORDS',
    time: 'SERVER_TIME',
    admin: 'ADMIN ACCESS',
    login: 'AUTHENTICATE',
    logout: 'TERMINATE SESSION',
    keyPlaceholder: 'ENTER SECURITY KEY',
    deploy: 'DEPLOY NODE',
    edit: 'RECONFIGURE',
    delete: 'DECOMMISSION',
    save: 'COMMIT',
    cancel: 'ABORT',
    name: 'NODE_ID',
    type: 'SECTOR/REGION',
    statusLabel: 'CURRENT_STATUS',
    endpoint: 'ENDPOINT',
    lastCheck: 'LAST CONTACT',
    httpCode: 'HTTP CODE',
    status: {
      OPERATIONAL: 'OPERATIONAL',
      DEGRADED: 'DEGRADED',
      OFFLINE: 'OFFLINE',
      MAINTENANCE: 'MAINTENANCE',
      UNKNOWN: 'UNKNOWN'
    }
  },
  zh: {
    title: '系统状态',
    subtitle: '星际链路监控',
    integrity: '系统完整性',
    latency: '延迟',
    uptime: '运行时间',
    region: '区域',
    load: '负载',
    id: '编号',
    events: '系统事件流',
    autoScroll: '自动滚动',
    live: '实时',
    secure: '安全连接',
    node: '节点',
    coords: '坐标',
    time: '服务器时间',
    admin: '管理员访问',
    login: '认证',
    logout: '终止会话',
    keyPlaceholder: '输入安全密钥',
    deploy: '部署节点',
    edit: '重新配置',
    delete: '退役',
    save: '提交',
    cancel: '中止',
    name: '节点标识',
    type: '扇区/区域',
    statusLabel: '当前状态',
    endpoint: '监控地址',
    lastCheck: '上次通信',
    httpCode: 'HTTP 状态码',
    status: {
      OPERATIONAL: '运行正常',
      DEGRADED: '性能降级',
      OFFLINE: '离线',
      MAINTENANCE: '维护中',
      UNKNOWN: '未知'
    }
  }
};

const EVENT_TEMPLATES = [
  { en: "Packets dropped in sector 7", zh: "第7扇区丢包", type: "WARN" },
  { en: "Handshake verified: node_alpha", zh: "握手验证通过: node_alpha", type: "INFO" },
  { en: "Coolant levels stable", zh: "冷却液液位稳定", type: "INFO" },
  { en: "Re-routing traffic via subnet B", zh: "流量重路由至子网 B", type: "INFO" },
  { en: "Ping spike detected in EU-CENTRAL", zh: "检测到 EU-CENTRAL 延迟激增", type: "WARN" },
  { en: "Encryption keys rotated", zh: "加密密钥已轮换", type: "INFO" },
  { en: "Cache flush initiated", zh: "缓存刷新已启动", type: "INFO" },
  { en: "CRITICAL: Packet loss > 5%", zh: "严重警告: 丢包率 > 5%", type: "CRIT" }
] as const;


// --- Helper Components ---

const HexColor = {
  cyan: '#00f3ff',
  red: '#ff2a2a',
  yellow: '#ffc600',
  purple: '#bd00ff',
  dark: '#0a0a12',
  dim: 'rgba(0, 243, 255, 0.1)',
};

const getStatusColor = (status: Status) => {
  switch (status) {
    case 'OPERATIONAL': return HexColor.cyan;
    case 'DEGRADED': return HexColor.yellow;
    case 'OFFLINE': return HexColor.red;
    case 'MAINTENANCE': return HexColor.purple;
    case 'UNKNOWN': return '#8c8c9a';
    default: return '#fff';
  }
};

const mapApiStatusToAppStatus = (apiStatus: string): Status => {
  const s = apiStatus?.toUpperCase();
  if (s === 'HEALTHY' || s === 'OK' || s === 'OPERATIONAL') return 'OPERATIONAL';
  if (s === 'DEGRADED') return 'DEGRADED';
  if (s === 'UNHEALTHY' || s === 'DOWN' || s === 'OFFLINE') return 'OFFLINE';
  if (s === 'MAINTENANCE') return 'MAINTENANCE';
  if (s === 'UNKNOWN') return 'UNKNOWN';
  return 'DEGRADED'; // Default fallback
};

const formatLastCheck = (value?: string) => {
  if (!value || value.startsWith('0001-01-01')) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleTimeString([], { hour12: false });
};

// --- Shared UI Components ---

const SciFiButton = ({ onClick, children, variant = 'cyan', style = {} }: any) => {
  const color = variant === 'red' ? HexColor.red : HexColor.cyan;
  return (
    <button 
      onClick={onClick}
      style={{
        background: 'transparent',
        border: `1px solid ${color}`,
        color: color,
        padding: '0.5rem 1.5rem',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.9rem',
        cursor: 'pointer',
        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        transition: 'all 0.2s',
        ...style
      }}
      onMouseEnter={(e) => {
         e.currentTarget.style.background = `${color}20`;
         e.currentTarget.style.boxShadow = `0 0 15px ${color}40`;
      }}
      onMouseLeave={(e) => {
         e.currentTarget.style.background = 'transparent';
         e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
};

const SciFiInput = ({ value, onChange, placeholder, label }: any) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
      // {label}
    </label>
    <input 
      type="text" 
      value={value} 
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.05)',
        border: 'none',
        borderBottom: `1px solid ${HexColor.cyan}`,
        color: '#fff',
        padding: '0.8rem',
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '1rem',
        outline: 'none'
      }}
    />
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: '#0a0a12',
        border: `1px solid ${HexColor.cyan}`,
        width: '90%', maxWidth: '500px',
        padding: '2rem',
        clipPath: 'polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px)',
        boxShadow: `0 0 30px rgba(0, 243, 255, 0.1)`,
        position: 'relative'
      }}>
        <h2 style={{ marginTop: 0, color: HexColor.cyan, fontFamily: '"Rajdhani", sans-serif', textTransform: 'uppercase', letterSpacing: '2px' }}>
          {title}
        </h2>
        <div style={{ height: '1px', background: `linear-gradient(90deg, ${HexColor.cyan}, transparent)`, marginBottom: '2rem' }} />
        {children}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'none', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

// --- Background Component ---

const StarryQuicksand = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const particleCount = 800;

    class Particle {
      x: number;
      y: number;
      speedX: number;
      speedY: number;
      size: number;
      opacity: number;
      fadeSpeed: number;
      color: string;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.speedY = 0.2 + Math.random() * 0.8;
        this.speedX = -0.1 - Math.random() * 0.3;
        this.size = 0.5 + Math.random() * 1.5; 
        this.opacity = Math.random() * 0.8;
        this.fadeSpeed = 0.002 + Math.random() * 0.005;
        const rand = Math.random();
        if (rand > 0.98) this.color = HexColor.cyan;
        else if (rand > 0.96) this.color = HexColor.purple;
        else this.color = '#ffffff';
      }

      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.opacity += this.fadeSpeed;
        if (this.opacity > 0.8 || this.opacity < 0.1) this.fadeSpeed = -this.fadeSpeed;
        if (this.y > height || this.x < 0) {
          this.y = -10;
          this.x = Math.random() * width + 100;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.color === '#ffffff' 
          ? `rgba(255, 255, 255, ${this.opacity})` 
          : this.color;
        ctx.globalAlpha = this.color === '#ffffff' ? 1 : 0.6;
        const length = this.size * (1 + Math.random());
        ctx.fillRect(this.x, this.y, length, this.size);
        ctx.globalAlpha = 1.0;
      }
    }

    for (let i = 0; i < particleCount; i++) particles.push(new Particle());

    const animate = () => {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      for (let y = 0; y < height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
      ctx.stroke();
      particles.forEach(p => { p.update(); p.draw(ctx); });
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: -1, pointerEvents: 'none' }} />;
};

// --- UI Components ---

const GlitchText = ({ text, subtext }: { text: string, subtext: string }) => {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <h1 className="glitch-title" style={{ 
        margin: 0, fontWeight: 700, color: '#fff', letterSpacing: '6px', textTransform: 'uppercase',
        position: 'relative', fontFamily: '"Rajdhani", "Noto Sans SC", sans-serif',
      }}>
        {text}
      </h1>
      <div className="glitch-subtitle" style={{ 
        color: HexColor.cyan, letterSpacing: '4px', marginTop: '5px',
        fontFamily: '"Share Tech Mono", "Noto Sans SC", monospace',
        background: 'linear-gradient(90deg, transparent, rgba(0,243,255,0.1), transparent)',
        padding: '2px 10px'
      }}>
        // {subtext}
      </div>
      <style>{`
        .glitch-title { text-shadow: 2px 0 ${HexColor.red}, -2px 0 ${HexColor.cyan}; animation: glitch 3s infinite linear alternate-reverse; }
        @keyframes glitch {
          0% { text-shadow: 2px 0 ${HexColor.red}, -2px 0 ${HexColor.cyan}; transform: skewX(0deg); }
          90% { text-shadow: 2px 0 ${HexColor.red}, -2px 0 ${HexColor.cyan}; transform: skewX(0deg); }
          91% { text-shadow: -2px 0 ${HexColor.red}, 2px 0 ${HexColor.cyan}; transform: skewX(10deg); }
          92% { text-shadow: 2px 0 ${HexColor.red}, -2px 0 ${HexColor.cyan}; transform: skewX(-10deg); }
          93% { text-shadow: 0 0 ${HexColor.red}, 0 0 ${HexColor.cyan}; transform: skewX(0deg); }
          100% { text-shadow: 2px 0 ${HexColor.red}, -2px 0 ${HexColor.cyan}; transform: skewX(0deg); }
        }
      `}</style>
    </div>
  );
};

const Card: React.FC<{
  service: Service;
  lang: Lang;
  isAdmin: boolean;
  onEdit: (s: Service) => void;
  onDelete: (id: string) => void;
}> = ({ service, lang, isAdmin, onEdit, onDelete }) => {
  const color = getStatusColor(service.status);
  const t = DICTIONARY[lang];
  const clipPath = "polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)";
  const httpCodeDisplay = typeof service.responseCode === 'number' && service.responseCode > 0 ? service.responseCode : '---';

  return (
    <div 
      className="service-card"
      style={{
        position: 'relative', clipPath: clipPath, background: 'rgba(10, 12, 16, 0.85)',
        borderLeft: `4px solid ${color}`, padding: '1.5rem', color: '#fff',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: '"Share Tech Mono", "Noto Sans SC", monospace',
        display: 'flex', flexDirection: 'column', gap: '1rem',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.05)'
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '20px 20px', pointerEvents: 'none', zIndex: 0
      }} />

      {/* Admin Controls */}
      {isAdmin && (
        <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, display: 'flex' }}>
          <button 
            onClick={() => onEdit(service)}
            style={{ background: HexColor.cyan, color: '#000', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold' }}>
            EDIT
          </button>
          <button 
            onClick={() => onDelete(service.id)}
            style={{ background: HexColor.red, color: '#000', border: 'none', padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold' }}>
            X
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#fff' }}>
            {service.name}
          </h3>
          <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>{t.id}: {service.id.padStart(4, '0')}</div>
        </div>
        <div style={{ 
          background: color, color: '#000', padding: '4px 8px', 
          fontSize: '0.75rem', fontWeight: 'bold',
          clipPath: 'polygon(10px 0, 100% 0, 100% 100%, 0% 100%)',
          textTransform: 'uppercase'
        }}>
          {t.status[service.status]}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888', marginBottom: '2px' }}>{t.latency}</div>
          <div style={{ color: service.latency > 100 ? HexColor.yellow : HexColor.cyan, fontSize: '1.2rem' }}>
            {service.status === 'OFFLINE' ? '---' : <>{service.latency}<span style={{ fontSize: '0.8rem', opacity: 0.7 }}>ms</span></>}
          </div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888', marginBottom: '2px' }}>{t.uptime}</div>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            {service.uptime}<span style={{ fontSize: '0.8rem', opacity: 0.7 }}>%</span>
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#666', marginBottom: '6px' }}>
          <span>{t.region}: {service.region}</span>
          <span>{t.load}</span>
        </div>
        <div style={{ width: '100%', height: '4px', background: '#222', position: 'relative' }}>
          <div style={{
             width: service.status === 'OFFLINE' ? '0%' : `${Math.random() * 40 + 30}%`,
             height: '100%', background: color, boxShadow: `0 0 10px ${color}80`
          }}></div>
        </div>
      </div>

      <div style={{ fontSize: '0.7rem', color: '#777', lineHeight: 1.4, position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: '4px' }}>// {t.endpoint}: {service.url || 'N/A'}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span>{t.httpCode}: {httpCodeDisplay}</span>
          <span>{t.lastCheck}: {formatLastCheck(service.lastCheck)}</span>
        </div>
      </div>

      <div className="hover-effect" style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: `linear-gradient(135deg, transparent 0%, ${color}10 100%)`,
        border: `1px solid ${color}`, opacity: 0, pointerEvents: 'none',
        transition: 'opacity 0.2s', zIndex: 2
      }}></div>
      <style>{` .service-card:hover { transform: translateY(-4px); } .service-card:hover .hover-effect { opacity: 1; } `}</style>
    </div>
  );
};

const AddServiceCard = ({ onClick, lang }: any) => {
  const t = DICTIONARY[lang];
  return (
    <div 
      onClick={onClick}
      style={{
        height: '100%', minHeight: '220px',
        border: `2px dashed ${HexColor.cyan}`,
        background: 'rgba(0, 243, 255, 0.05)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: HexColor.cyan,
        clipPath: "polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)",
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>+</div>
      <div style={{ fontFamily: '"Share Tech Mono", monospace', letterSpacing: '1px' }}>{t.deploy}</div>
    </div>
  );
};

const Terminal = ({ logs, lang }: { logs: LogEntry[]; lang: Lang }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const t = DICTIONARY[lang];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  return (
    <div style={{
      marginTop: '3rem', border: '1px solid #333', background: 'rgba(5, 5, 8, 0.95)',
      padding: '0', fontFamily: '"Share Tech Mono", "Noto Sans SC", monospace',
      height: '250px', display: 'flex', flexDirection: 'column',
      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 30px 100%, 0 calc(100% - 30px))',
      position: 'relative'
    }}>
      <div style={{ 
        background: '#1a1a20', padding: '0.5rem 1rem', borderBottom: '1px solid #333',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#888'
      }}>
        <span>// {t.events}</span>
        <div style={{ display: 'flex', gap: '10px' }}>
           <span>{t.autoScroll}: ON</span>
           <span style={{ color: HexColor.cyan }}>{t.live}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', fontSize: '0.85rem' }}>
        {logs.map((log, i) => {
           const isCritical = log.type === 'CRIT';
           const isWarn = log.type === 'WARN';
           return (
            <div key={i} style={{ marginBottom: '6px', display: 'flex', opacity: 0.9 }}>
              <span style={{ color: '#444', marginRight: '15px', minWidth: '80px' }}>[{log.timestamp}]</span>
              <span style={{ 
                color: isCritical ? HexColor.red : isWarn ? HexColor.yellow : HexColor.cyan,
                textShadow: isCritical ? `0 0 5px ${HexColor.red}` : 'none'
              }}>{`> ${log.message[lang]}`}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};

const GlobalStatusIndicator = ({ status, lang }: { status: Status; lang: Lang }) => {
  const color = getStatusColor(status);
  const t = DICTIONARY[lang];
  return (
    <div style={{ textAlign: 'right', borderRight: `4px solid ${color}`, paddingRight: '1.5rem', height: '100%' }}>
      <div style={{ fontSize: '0.8rem', color: '#666', letterSpacing: '2px' }}>{t.integrity}</div>
      <div className="status-value" style={{ 
        fontWeight: 'bold', color: color, textShadow: `0 0 20px ${color}60`,
        fontFamily: '"Rajdhani", "Noto Sans SC", sans-serif', lineHeight: 1
      }}>{t.status[status]}</div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [services, setServices] = useState<Service[]>(INITIAL_SERVICES);
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: new Date().toLocaleTimeString([], { hour12: false }), message: { en: 'INITIALIZING SYSTEM MONITOR...', zh: '正在初始化系统监控...' }, type: 'INFO' },
  ]);
  const [globalStatus, setGlobalStatus] = useState<Status>('OPERATIONAL');
  const [lang, setLang] = useState<Lang>('en');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  
  // Admin State
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const isAdmin = !!adminKey;
  const [showLogin, setShowLogin] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  
  // Editor State
  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', region: '', url: '' });

  const t = DICTIONARY[lang];

  // 1. Load Config
  useEffect(() => {
    fetch('/config.json')
      .then(res => { if (res.ok) return res.json(); throw new Error("Config not found"); })
      .then((cfg: AppConfig) => {
        setConfig(cfg);
        setIsConfigLoaded(true);
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'REMOTE CONFIGURATION LOADED.', zh: '远程配置已加载。' }, type: 'INFO' }]);
      })
      .catch(() => {
        setIsConfigLoaded(true);
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'CONFIG NOT FOUND. ACTIVATING SIMULATION PROTOCOL.', zh: '未找到配置。正在激活模拟协议。' }, type: 'WARN' }]);
      });
  }, []);

  // 2. Data Loop
  useEffect(() => {
    if (!isConfigLoaded) return;

    const fetchDataOrSimulate = async () => {
      if (config) {
        try {
          // Use adminKey if available, otherwise readKey
          const key = adminKey || config.readKey;
          const res = await fetch(`${config.apiBase}/monitor`, {
            headers: { 'Authorization': key }
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          const newServices: Service[] = data.map((item: any) => {
             const appStatus = mapApiStatusToAppStatus(item.status);
             const latencyFromApi = typeof item.last_response_time_ms === 'number' ? item.last_response_time_ms : 0;
             return {
               id: String(item.id),
               name: item.name,
               status: appStatus,
               latency: latencyFromApi,
               uptime: appStatus === 'OPERATIONAL' ? 99.9 : 95.0,
               region: item.type || 'UNKNOWN', // Map type to region
               url: item.url,
               lastCheck: item.last_check,
               responseCode: item.last_response_code
             };
          });
          setServices(newServices);

          try {
            const statusRes = await fetch(`${config.apiBase}/status`, { headers: { 'Authorization': key } });
            if (statusRes.ok) {
              const statusPayload = await statusRes.json();
              setGlobalStatus(mapApiStatusToAppStatus(statusPayload.status));
            }
          } catch (statusErr) {
            console.warn('Failed to fetch status summary', statusErr);
          }
        } catch (err) {
          setLogs(prev => {
             if (prev.length > 0 && prev[prev.length-1].message.en.includes('CONNECTION ERROR')) return prev;
             return [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'API CONNECTION ERROR: RETRYING...', zh: 'API 连接错误: 重试中...' }, type: 'CRIT' }];
          });
        }
      } else {
        // Simulation
        setServices(prev => prev.map(svc => {
          if (svc.status === 'OFFLINE') return svc;
          const fluctuation = Math.floor(Math.random() * 20) - 10;
          let newLatency = Math.max(0, svc.latency + fluctuation);
          if (Math.random() > 0.95) newLatency += 100;
          return { ...svc, latency: newLatency, lastCheck: new Date().toISOString() };
        }));
      }
      // Ambient Log
      if (Math.random() > 0.95) {
        const evt = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
        setLogs(prev => [...prev.slice(-19), { timestamp: new Date().toLocaleTimeString(), message: { en: evt.en, zh: evt.zh }, type: evt.type as 'INFO' | 'WARN' | 'CRIT' }]);
      }
    };

    const intervalTime = config ? 3000 : 1500;
    const interval = setInterval(fetchDataOrSimulate, intervalTime);
    fetchDataOrSimulate();
    return () => clearInterval(interval);
  }, [isConfigLoaded, config, adminKey]);

  useEffect(() => {
    if (config) return;
    const offline = services.some(s => s.status === 'OFFLINE');
    const degraded = services.some(s => s.status === 'DEGRADED');
    if (offline) setGlobalStatus('OFFLINE');
    else if (degraded) setGlobalStatus('DEGRADED');
    else setGlobalStatus('OPERATIONAL');
  }, [services, config]);

  // --- Actions ---

  const handleLogin = () => {
    if (loginInput.trim()) {
      setAdminKey(loginInput);
      setShowLogin(false);
      setLoginInput('');
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'ADMIN PRIVILEGES GRANTED', zh: '管理员权限已授予' }, type: 'INFO' }]);
    }
  };

  const handleLogout = () => {
    setAdminKey(null);
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'ADMIN SESSION TERMINATED', zh: '管理员会话已终止' }, type: 'INFO' }]);
  };

  const openCreate = () => {
    setEditorMode('CREATE');
    setFormData({ name: '', region: '', url: '' });
    setShowEditor(true);
  };

  const openEdit = (svc: Service) => {
    setEditorMode('EDIT');
    setEditId(svc.id);
    setFormData({ name: svc.name, region: svc.region, url: svc.url || '' });
    setShowEditor(true);
  };

  const handleSaveService = async () => {
    if (!formData.name.trim() || !formData.region.trim() || !formData.url.trim()) {
      alert('Name, region, and URL are required.');
      return;
    }
    const payload = {
      name: formData.name,
      type: formData.region, // Map region back to type for API
      url: formData.url
    };

    if (config && adminKey) {
      // API MODE
      const url = editorMode === 'CREATE' ? `${config.apiBase}/monitor` : `${config.apiBase}/monitor/${editId}`;
      const method = editorMode === 'CREATE' ? 'POST' : 'PUT';
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': adminKey },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed");
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: `SERVICE ${editorMode === 'CREATE' ? 'DEPLOYED' : 'UPDATED'}`, zh: `服务已${editorMode === 'CREATE' ? '部署' : '更新'}` }, type: 'INFO' }]);
      } catch(e) {
        alert("Operation Failed");
      }
    } else {
      // SIMULATION MODE
      if (editorMode === 'CREATE') {
        const newSvc: Service = {
          id: Math.random().toString(36).substr(2, 9),
          name: payload.name,
          status: 'OPERATIONAL',
          region: payload.type,
          url: payload.url,
          latency: 10,
          uptime: 100,
          lastCheck: new Date().toISOString(),
          responseCode: 200
        };
        setServices(prev => [...prev, newSvc]);
      } else {
        setServices(prev => prev.map(s => s.id === editId ? { ...s, name: payload.name, region: payload.type, url: payload.url } : s));
      }
    }
    setShowEditor(false);
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm(t.delete + '?')) return;
    
    if (config && adminKey) {
      // API
      try {
        await fetch(`${config.apiBase}/monitor/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': adminKey }
        });
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: { en: 'SERVICE DECOMMISSIONED', zh: '服务已退役' }, type: 'WARN' }]);
      } catch(e) { alert("Delete failed"); }
    } else {
      // Sim
      setServices(prev => prev.filter(s => s.id !== id));
    }
  };

  return (
    <>
      <StarryQuicksand />
      <style>{`
        .app-container { max-width: 1400px; margin: 0 auto; padding: 3rem; position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
        .app-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2rem; }
        .header-controls { display: flex; gap: 2rem; align-items: center; }
        .service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 2rem; flex: 1; }
        .glitch-title { font-size: 3.5rem; }
        .glitch-subtitle { font-size: 1rem; }
        .status-value { font-size: 2.5rem; }
        @media (max-width: 768px) {
          .app-container { padding: 1rem; }
          .app-header { flex-direction: column; align-items: flex-start; gap: 1.5rem; margin-bottom: 2rem; }
          .header-controls { width: 100%; justify-content: space-between; gap: 1rem; }
          .glitch-title { font-size: 2.2rem !important; }
          .glitch-subtitle { font-size: 0.85rem !important; }
          .service-grid { grid-template-columns: 1fr; gap: 1.5rem; }
          .status-value { font-size: 2rem !important; }
        }
      `}</style>

      <div className="app-container">
        
        {/* HEADER */}
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column' }}>
            <GlitchText text={t.title} subtext={t.subtitle} />
          </div>

          <div className="header-controls">
            <SciFiButton onClick={isAdmin ? handleLogout : () => setShowLogin(true)} variant={isAdmin ? 'red' : 'cyan'}>
              {isAdmin ? `[ ${t.logout} ]` : `[ ${t.admin} ]`}
            </SciFiButton>

            <button 
              onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
              style={{
                background: 'transparent', border: `1px solid ${HexColor.cyan}`, color: HexColor.cyan,
                padding: '0.5rem 1rem', fontFamily: '"Share Tech Mono", "Noto Sans SC", monospace',
                fontSize: '1rem', cursor: 'pointer',
                clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
                textTransform: 'uppercase'
              }}
            >
              [ {lang === 'en' ? 'EN' : '中文'} ]
            </button>

            <GlobalStatusIndicator status={globalStatus} lang={lang} />
          </div>
        </header>

        {/* GRID */}
        <div className="service-grid">
          {services.map(svc => (
            <Card 
              key={svc.id} 
              service={svc} 
              lang={lang} 
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={handleDeleteService}
            />
          ))}
          {isAdmin && <AddServiceCard onClick={openCreate} lang={lang} />}
        </div>

        {/* FOOTER */}
        <Terminal logs={logs} lang={lang} />
        
        <footer style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', opacity: 0.6, fontSize: '0.7rem', fontFamily: '"Share Tech Mono", "Noto Sans SC", monospace', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <div>{t.secure}: TLS v1.3 // {t.node}: ALPHA-7</div>
          <div>{t.coords}: 34.0522° N, 118.2437° W</div>
        </footer>
      </div>

      {/* LOGIN MODAL */}
      <Modal isOpen={showLogin} onClose={() => setShowLogin(false)} title={t.admin}>
        <SciFiInput 
          label={t.keyPlaceholder} 
          value={loginInput} 
          onChange={(e: any) => setLoginInput(e.target.value)} 
          placeholder="****-****-****"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <SciFiButton onClick={() => setShowLogin(false)} variant="red">{t.cancel}</SciFiButton>
          <SciFiButton onClick={handleLogin}>{t.login}</SciFiButton>
        </div>
      </Modal>

      {/* EDITOR MODAL */}
      <Modal isOpen={showEditor} onClose={() => setShowEditor(false)} title={editorMode === 'CREATE' ? t.deploy : t.edit}>
        <SciFiInput 
          label={t.name} 
          value={formData.name} 
          onChange={(e: any) => setFormData({...formData, name: e.target.value})} 
          placeholder="e.g. CORE_GATEWAY"
        />
        <SciFiInput
          label={t.type}
          value={formData.region}
          onChange={(e: any) => setFormData({...formData, region: e.target.value})}
          placeholder="e.g. API"
        />
        <SciFiInput
          label={t.endpoint}
          value={formData.url}
          onChange={(e: any) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://status.example.com/health"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <SciFiButton onClick={() => setShowEditor(false)} variant="red">{t.cancel}</SciFiButton>
          <SciFiButton onClick={handleSaveService}>{t.save}</SciFiButton>
        </div>
      </Modal>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);