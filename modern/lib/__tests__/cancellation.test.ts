// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { clearHttpCache, getJSON, setFetcher } from '../chronos/http';
import { replayFixture } from '../chronos/fixtures';
import type { Fixture } from '../chronos/types';
afterEach(()=>{setFetcher(null);clearHttpCache();vi.useRealTimers();});
it('aborts upstream work once its last waiting run disconnects, without retrying',async()=>{
 let upstream: AbortSignal | undefined;
 const network=vi.fn((_url: unknown, init?: RequestInit)=>new Promise<Response>((_resolve,reject)=>{
  upstream=init?.signal as AbortSignal;
  upstream.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
 }));
 setFetcher(network as typeof fetch);
 const abort=new AbortController();
 const result=getJSON('https://example.com/cancel',{lane:'wikipedia',signal:abort.signal});
 abort.abort();
 await expect(result).rejects.toMatchObject({name:'AbortError'});
 expect(upstream?.aborted).toBe(true);
 await new Promise(resolve=>setTimeout(resolve,650));
 expect(network).toHaveBeenCalledTimes(1);
});
it('a cancelled subscriber does not interrupt another run sharing the same request',async()=>{
 let finish:(value: Response)=>void=()=>{};let upstream:AbortSignal|undefined;
 setFetcher(((_url:unknown,init?:RequestInit)=>{upstream=init?.signal as AbortSignal;return new Promise<Response>(r=>{finish=r;});}) as typeof fetch);
 const first=new AbortController();const second=new AbortController();
 const a=getJSON('https://example.com/shared',{lane:'wikipedia',signal:first.signal});
 const b=getJSON('https://example.com/shared',{lane:'wikipedia',signal:second.signal});
 first.abort();await expect(a).rejects.toMatchObject({name:'AbortError'});expect(upstream?.aborted).toBe(false);
 finish(Response.json({ok:true}));await expect(b).resolves.toEqual({ok:true});
});
it('replay does not emit the frame whose pacing delay was aborted',async()=>{
 vi.useFakeTimers();const abort=new AbortController();const send=vi.fn();
 const fx={query:'test',frames:[{t:100,event:'event',data:{title:'late'}}]} as unknown as Fixture;
 const run=replayFixture(fx,send,abort.signal,{notice:false});abort.abort();await run;expect(send).not.toHaveBeenCalled();
});
