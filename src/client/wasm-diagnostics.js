/** Extract the first actionable TeX error instead of a generic engine warning. */
export function wasmDiagnostics(log = '', mainFile = 'main.tex') {
 const text = String(log), missing = text.match(/(?:LaTeX Error: File|I can't find file)\s*[`']([^'`\n]+)['`]/);
 const first = text.match(/^!\s*(.+)/m);
 const location = text.match(/^l\.(\d+)\s*(.*)/m);
 const engine = /(?:requires (?:either )?XeTeX|requires either XeTeX or LuaTeX|fontspec.*(?:Error|error)|Unicode character|CTeX fontset|not set up for use with LaTeX)/s.test(text);
 const message = missing ? `本地宏包库中未找到 ${missing[1]}` : first?.[1]?.trim() || text.trim().split('\n')[0]?.slice(0,250) || '本地 TeX 编译失败';
 return [{ message, file: mainFile, ...(location ? { line: Number(location[1]), detail: location[2].trim() } : {}),
  hint: missing ? '可上传兼容 pdfLaTeX 的宏包及其依赖，或使用服务器编译。' : engine ? '此文档需要中文、Unicode 或系统字体支持，请切换 XeLaTeX / LuaLaTeX。' : '请查看完整编译日志并检查该行及其前面的命令。',
  code: missing ? 'wasm-missing-file' : engine ? 'wasm-engine-required' : 'wasm-tex-error' }];
}
