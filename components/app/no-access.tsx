'use client';
import { useContext } from 'react';
import { AppContext } from './context';
import { PageError } from '../ui/page-error';
export function NoAccess() {
 const member=useContext(AppContext)?.member;
 return <PageError title={member?.role==='client'?'This page is for your maintenance team.':'This page is unavailable.'} message="You can return home or go back to the previous page." home={member?(member.role==='client'?'/home':'/dashboard'):'/sign-in'} footer={!!member} homeLabel={member?'Go to home':'Sign in'}/>;
}
