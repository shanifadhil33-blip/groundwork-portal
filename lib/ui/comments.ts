export type CommentVisibility='internal'|'client';
export function storedCommentVisibility(storage:Pick<Storage,'getItem'>,user:string):CommentVisibility {
 try{return storage.getItem(`comment-visibility:${user}`)==='client'?'client':'internal';}catch{return 'internal';}
}
export function saveCommentVisibility(storage:Pick<Storage,'setItem'>,user:string,value:CommentVisibility){try{storage.setItem(`comment-visibility:${user}`,value);}catch{}}
export function explicitClientComment(text:string){
 // Quoted comment bodies are content, not visibility instructions.
 const instruction=text.replace(/(?:^|\s)(['"`])[\s\S]*?\1(?=\s|$|[.,])/g,' ').replace(/[“‘][\s\S]*?[”’]/g,' ');
 return /(?:client[ -]visible|visible to (?:the )?client|(?:share|send|post)[\s\S]{0,100}(?:with|to|for) (?:the )?client)/i.test(instruction)&&!/(?:not|don’t|don't|never|shouldn’t|shouldn't)[\s\S]{0,30}(?:client[ -]visible|share|send|visible to)/i.test(instruction);
}
