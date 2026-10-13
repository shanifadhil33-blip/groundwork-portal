'use client';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { ThreadMessages } from './messages';
import { ErrorState } from '../ui';
export function TeamSpace(){const {member,me}=useApp(),allowed=!!member&&member.role!=='client',base=member?`/api/workspaces/${member.workspace_id}`:null;
 const team=useResource<{id:string;can_moderate:boolean}>(allowed?`${base}/team-space`:null);
 if(!allowed)return <NoAccess/>;
 return <div className="page stack"><h1>Team space</h1><p>A private space for your maintenance company.</p>{team.error?<ErrorState retry={team.reload}/>:team.data?<ThreadMessages key={`${me.user.id}:${team.data.id}`} thread={{conversation_id:team.data.id}} canModerate={team.data.can_moderate}/>:<p>Loading Team space</p>}</div>;}
