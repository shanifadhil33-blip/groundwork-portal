/** A chat belongs to one person in one workspace, including demo persona switches. */
export const personalAgentChatKey=(user:string,workspace:string)=>`groundwork-agent-chat:${user}:${workspace}`;
