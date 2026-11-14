/** Generate reviewable Codex TOML without storing credentials in configuration. */
export function codexMcpConfig({origin,projectId,mode='http',scriptPath='',workspace='',python='python'}){
 if(!/^[A-Za-z0-9-]{1,80}$/.test(projectId))throw Error('项目标识无效');const base=new URL(origin);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('服务地址必须为 HTTP(S) origin');
 const suffix=projectId.replaceAll('-','_'),name='underoot_'+suffix,tokenEnv='UNDEROOT_'+suffix.toUpperCase()+'_TOKEN',url=base.origin+'/api/mcp/v1/projects/'+projectId,projectUrl=base.origin+'/api/agent/v1/projects/'+projectId;
 const quote=s=>JSON.stringify(s);let toml=`[mcp_servers.${name}]\n`;
 if(mode==='http')toml+=`url = ${quote(url)}\nbearer_token_env_var = ${quote(tokenEnv)}\n`;
 else if(mode==='stdio'){
  const absolute=p=>/^(?:[A-Za-z]:[\\/]|\/)/.test(p)&&!/[\x00-\x1f]/.test(p);if(!absolute(scriptPath)||!absolute(workspace))throw Error('本地模式请填写桥接脚本和实验目录的绝对路径');if(!['python','python3','py'].includes(python))throw Error('请选择 Python 命令');
  toml+=`command = ${quote(python)}\nargs = [${quote(scriptPath)}, "--root", ${quote(workspace)}]\ncwd = ${quote(workspace)}\nenv_vars = [${quote(tokenEnv)}]\n`;
 }else throw Error('连接方式无效');
 toml+='startup_timeout_sec = 20\ntool_timeout_sec = 180\n';
 if(mode==='stdio')toml+=`\n[mcp_servers.${name}.env]\nUNDEROOT_PROJECT_URL = ${quote(projectUrl)}\nUNDEROOT_TOKEN_ENV = ${quote(tokenEnv)}\n`;
 return{name,tokenEnv,url,projectUrl,toml,mode,command:mode==='http'?`codex mcp add ${name} --url ${quote(url)} --bearer-token-env-var ${tokenEnv}`:null};
}
