/**
 * PDF.js 6.x 的浏览器兼容层。
 *
 * 这个文件同时被两处使用：
 *   1. 主线程：src/client/pdf-viewer.js 里 `import './pdf-polyfill.js'`（在任何 PDF.js 代码之前执行）；
 *   2. Worker：scripts/build.mjs 把本文件的源码原样注入到 pdf.worker.min.mjs 的最前面。
 * 因此这里**只能写纯脚本语句**，不能出现 import / export（build.mjs 会校验）。
 *
 * PDF.js 6.x 直接依赖了一批「已经进入提案、但不少浏览器还没实现」的新 API。
 * 只要某个 API 缺失，就会在渲染到对应代码路径时抛出 `xxx is not a function`，
 * 表现为整份 PDF 打不开（而不是局部显示异常），所以这里一次性补齐：
 *
 *   Math.sumPrecise                      字体表（glyf / name）长度计算
 *   Uint8Array.prototype.toHex           文档指纹 fingerprints（缺了报 "a.toHex is not a function"）
 *   Uint8Array.prototype.toBase64        内嵌数据流 / 图像
 *   Uint8Array.fromHex / fromBase64      读取内嵌 hex / base64 内容
 *   Promise.withResolvers / Promise.try  流式读取与消息处理
 *   Map/WeakMap getOrInsert*             PDF.js 6.5 大量用于缓存与分组（缺了报
 *                                        "this[#i].getOrInsertComputed is not a function"）
 *   Array toSorted/toReversed/toSpliced/with/findLast/findLastIndex
 *                                        ES2023 数组方法，少量使用
 *
 * scripts/build.mjs 会在构建时扫描 pdfjs 产物，一旦发现上面这些 API 被使用、
 * 而兼容层里没有对应实现，就直接构建失败（避免升级 pdfjs 后又跑到线上才发现）。
 */
(function installPdfjsCompat() {
  const define = (target, name, value) => {
    if (typeof target[name] === 'function') return;
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  };

  /* ---------- Math.sumPrecise（Neumaier 补偿求和，整数场景精确） ---------- */
  if (typeof Math.sumPrecise !== 'function') {
    Object.defineProperty(Math, 'sumPrecise', {
      configurable: true,
      writable: true,
      value(values) {
        let sum = 0;
        let correction = 0;
        for (const x of values) {
          const t = sum + x;
          if (Math.abs(sum) >= Math.abs(x)) correction += (sum - t) + x;
          else correction += (x - t) + sum;
          sum = t;
        }
        return sum + correction;
      },
    });
  }

  /* ---------- Uint8Array 的 hex 编解码 ---------- */
  const HEX = '0123456789abcdef';

  define(Uint8Array.prototype, 'toHex', function toHex() {
    let out = '';
    for (let i = 0; i < this.length; i += 1) {
      const byte = this[i];
      out += HEX[byte >> 4] + HEX[byte & 15];
    }
    return out;
  });

  define(Uint8Array, 'fromHex', function fromHex(string) {
    const text = String(string);
    if (text.length % 2 !== 0) throw new SyntaxError('Invalid hex string length');
    const out = new Uint8Array(text.length >> 1);
    for (let i = 0; i < out.length; i += 1) {
      const pair = text.slice(i * 2, i * 2 + 2);
      const value = Number.parseInt(pair, 16);
      if (Number.isNaN(value)) throw new SyntaxError(`Invalid hex string: ${pair}`);
      out[i] = value;
    }
    return out;
  });

  /* ---------- Uint8Array 的 base64 编解码（不依赖 Buffer） ---------- */
  define(Uint8Array.prototype, 'toBase64', function toBase64() {
    let binary = '';
    for (let i = 0; i < this.length; i += 1) binary += String.fromCharCode(this[i]);
    return btoa(binary);
  });

  define(Uint8Array, 'fromBase64', function fromBase64(string) {
    const binary = atob(String(string).replace(/\s+/g, ''));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  });

  /* ---------- Promise 辅助方法 ---------- */
  define(Promise, 'withResolvers', function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  });

  if (typeof Promise.try !== 'function') {
    Object.defineProperty(Promise, 'try', {
      configurable: true,
      writable: true,
      value(fn, ...args) {
        return new Promise((resolve) => resolve(fn(...args)));
      },
    });
  }

  /* ---------- Map / WeakMap 的 getOrInsert / getOrInsertComputed ---------- */
  // 提案语义：
  //   map.getOrInsert(key, value)              不存在时才写入 value，返回最终值
  //   map.getOrInsertComputed(key, callback)   不存在时调用 callback(key) 求值并写入
  // 注意 value 是值本身（不会被执行），callback 的入参是 key。
  const installUpsert = (Ctor) => {
    if (!Ctor || !Ctor.prototype) return;

    define(Ctor.prototype, 'getOrInsert', function getOrInsert(key, value) {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    });

    define(Ctor.prototype, 'getOrInsertComputed', function getOrInsertComputed(key, compute) {
      if (typeof compute !== 'function') {
        throw new TypeError('Map.prototype.getOrInsertComputed: argument is not a function');
      }
      if (this.has(key)) return this.get(key);
      const value = compute(key);
      this.set(key, value);
      return value;
    });
  };

  installUpsert(typeof Map === 'function' ? Map : null);
  installUpsert(typeof WeakMap === 'function' ? WeakMap : null);

  /* ---------- ES2023 数组方法（PDF.js 少量使用） ---------- */
  const arrayProto = Array.prototype;

  define(arrayProto, 'toReversed', function toReversed() {
    return Array.prototype.slice.call(this).reverse();
  });

  define(arrayProto, 'toSorted', function toSorted(compare) {
    return Array.prototype.slice.call(this).sort(compare);
  });

  define(arrayProto, 'toSpliced', function toSpliced(start, deleteCount, ...items) {
    const copy = Array.prototype.slice.call(this);
    if (arguments.length === 0) return copy;
    if (arguments.length === 1) copy.splice(start);
    else copy.splice(start, deleteCount, ...items);
    return copy;
  });

  define(arrayProto, 'with', function withMethod(index, value) {
    const copy = Array.prototype.slice.call(this);
    const i = index < 0 ? copy.length + index : index;
    copy[i] = value;
    return copy;
  });

  define(arrayProto, 'findLast', function findLast(predicate, thisArg) {
    for (let i = this.length - 1; i >= 0; i -= 1) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  });

  define(arrayProto, 'findLastIndex', function findLastIndex(predicate, thisArg) {
    for (let i = this.length - 1; i >= 0; i -= 1) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  });
})();
