// Hosted requests must pass the shared team login in server.js; local development stays local-only.
function workspaceAccess(req){return req.teamAuthorized===true||['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}
module.exports={workspaceAccess};
