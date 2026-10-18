const test=require('node:test'),assert=require('node:assert/strict');
const {workspaceAccess}=require('./access');
test('customer and supplier APIs accept local development and authenticated team requests',()=>{
 assert(workspaceAccess({socket:{remoteAddress:'127.0.0.1'}}));
 assert(workspaceAccess({socket:{remoteAddress:'203.0.113.1'},teamAuthorized:true}));
});
test('remote requests and user-controlled headers cannot bypass team authentication',()=>{
 assert(!workspaceAccess({socket:{remoteAddress:'203.0.113.1'}}));
 assert(!workspaceAccess({socket:{remoteAddress:'203.0.113.1'},headers:{'x-team-authorized':'true'}}));
});
