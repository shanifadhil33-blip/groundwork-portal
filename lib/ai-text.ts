/** Removes reasoning that some free models put in the reply (think tags, or a closing tag with the notes before it). */
export function stripThinking(text:string){return text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi,'').replace(/^[\s\S]*?<\/(think|thinking|reasoning)>/i,'').trim();}
