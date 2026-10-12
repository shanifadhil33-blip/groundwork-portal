'use client';
import { useContext } from 'react';
import { AppContext } from './context';
import { PageError } from '../ui/page-error';
export function NoAccess() {
 const member=useContext(AppContext)?.member;
 const home=member?.role==='client'?'/home':member?.role==='technician'?'/today':'/dashboard';
 return <PageError title="You can’t open this page." message={member?.role==='client'?'It is for your maintenance team.':member?.role==='technician'?'It is for supervisors and admins.':'Go back or go home.'} home={member?home:'/sign-in'} footer={!!member} homeLabel={member?'Go home':'Sign in'}/>;
}
