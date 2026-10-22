import { endpoint } from '../../../../lib/api';
import * as s from '../../../../lib/services/company-join-rehearsal';
export const GET=endpoint(({user,req})=>{
 const query=new URL(req.url).searchParams;
 if(query.has('q'))return s.searchPracticeCompanies(user,query.get('q')??'');
 if(query.has('details'))return s.practiceJoinDetails(user);
 if(query.has('workspace'))return s.listPracticeJoinRequests(user,query.get('workspace')??'');
 return s.myPracticeJoinRequests(user);
});
export const POST=endpoint(({user,body})=>s.requestPracticeJoin(user,body),{body:true,status:201});
export const PATCH=endpoint(({user,body})=>s.decidePracticeJoinRequest(user,body),{body:true});
