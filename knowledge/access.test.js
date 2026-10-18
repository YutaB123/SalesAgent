const test=require('node:test'),assert=require('node:assert/strict');
const {workspaceAccess}=require('./access');
test('customer and supplier APIs are available to public demo visitors',()=>{
 assert(workspaceAccess({socket:{remoteAddress:'127.0.0.1'}}));
 assert(workspaceAccess({socket:{remoteAddress:'203.0.113.1'}}));
 assert(workspaceAccess({socket:{remoteAddress:'203.0.113.1'},headers:{'x-team-authorized':'true'}}));
});
