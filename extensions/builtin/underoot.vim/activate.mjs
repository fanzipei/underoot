export function activate(host,manifest){return manifest.contributes.commands.map((command)=>host.registerCommand(command,()=>host.actions[command.handler]?.()));}
