'use client';
import { useEffect, useState } from 'react';

/** After Sign out the app lands here with ?signed_out=1. */
export function SignedOutNote() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(new URLSearchParams(window.location.search).get('signed_out') === '1'); }, []);
  return show ? <p className="lx-signed-out" role="status">You are signed out.</p> : null;
}
