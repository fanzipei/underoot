/**
 * 安全响应头中间件（面向公网暴露时的基础防护）
 *
 * 通过 .env 配置：
 *   LATEXSTUDIO_HSTS=1        仅当站点经过 HTTPS 反向代理时开启 HSTS
 *   LATEXSTUDIO_TRUST_PROXY   设为 1 / loopback / 具体 IP 段时信任 X-Forwarded-*（用于正确识别 secure 与真实客户端 IP）
 *
 * 注意：CSP 允许 'self' 的脚本与样式；本项目前端是打包后的 app.js，无内联脚本；
 * 部分内联 style 属性需要 'unsafe-inline'，故样式源放宽到该值。
 */
import { config } from './config.js';

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function applySecurity(app) {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
    if (config.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
}

/** 在 Express 上声明信任的反向代理来源（用于 req.secure / req.ip 正确识别） */
export function configureTrustProxy(app) {
  const value = config.trustProxy;
  if (value) {
    // 1 / loopback / 具体 IP 或 CIDR 均可被 Express 解析
    if (value === '1' || value === 'true') app.set('trust proxy', 'loopback');
    else app.set('trust proxy', value);
  }
}
