import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { version } from '../../../package.json';
import { verifyToken } from '../../../lib/services/tokens';
import { callTool,tools,type AgentContext } from '../../../lib/agent/tools';
import { errorResponse } from '../../../lib/http';
export const runtime='nodejs';
async function handle(req:Request) {
 let identity;
 try {identity=await verifyToken(req);}catch(error){const response=errorResponse(error);response.headers.set('WWW-Authenticate','Bearer');return response;}
 const c:AgentContext={user:identity.user_id,ws:identity.workspace_id,scope:identity.scope,tokenId:identity.id,kind:'agent'};
 const server=new McpServer({name:'groundwork',version});
 for(const [name,t] of Object.entries(tools))server.registerTool(name,{description:t.description,inputSchema:t.schema,annotations:{readOnlyHint:!t.write,destructiveHint:t.write}},async args=>callTool(c,name,args));
 // Keep declared schemas for discovery, but normalize all call errors through the shared API boundary.
 server.server.setRequestHandler(CallToolRequestSchema,async request=>callTool(c,request.params.name,request.params.arguments??{}));
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try {await server.connect(transport);return await transport.handleRequest(req);}catch(error){return errorResponse(error);}finally{await server.close();}
}
export const POST=handle;
export const GET=handle;
export const DELETE=handle;
