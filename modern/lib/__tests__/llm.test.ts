// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {complete, stream} from '../llm';
import {llmEras, llmNarrative, llmRange, llmSeedEvents} from '../chronos/llm';
const fetchMock=vi.fn<typeof fetch>();
beforeEach(()=>{vi.stubEnv('GROQ_API_KEY','test-only-placeholder');vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset().mockResolvedValue(Response.json({choices:[{message:{content:'{}'}}]}));});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const body=()=>JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
describe('Chronos provider contract',()=>{
 it.each([['fast','openai/gpt-oss-20b'],['deep','openai/gpt-oss-120b']] as const)('uses current %s model and reasoning settings',async(model,id)=>{
  await complete({messages:[],model,maxTokens:400,json:true});
  expect(body()).toMatchObject({model:id,reasoning_effort:'low',include_reasoning:false,max_tokens:656,stream:false,response_format:{type:'json_object'}});
 });
 it('passes abort signal to provider',async()=>{const abort=new AbortController();await complete({messages:[],signal:abort.signal});expect(fetchMock.mock.calls[0][1]!.signal).toBe(abort.signal);});
 it('throws an honest missing key error without network work',async()=>{vi.stubEnv('GROQ_API_KEY','');await expect(complete({messages:[]})).rejects.toThrow('GROQ_API_KEY is not set');expect(fetchMock).not.toHaveBeenCalled();});
 it('preserves provider error status/detail',async()=>{fetchMock.mockResolvedValue(new Response('quota exhausted',{status:429}));await expect(complete({messages:[]})).rejects.toThrow('Groq 429: quota exhausted');});
 it.each(['quick','deep'] as const)('preserves seed budget and honest label in %s mode',async mode=>{
  const result=await llmSeedEvents('Rome',{start:1,end:2000},'city',mode);
  expect(body().max_tokens).toBe((mode==='deep'?4500:3500)+256);
  expect(result.model).toBe(mode==='deep'?'GPT OSS 120B':'GPT OSS 20B');
 });
 it('preserves eras budget',async()=>{await llmEras('Rome',{start:1,end:2000});expect(body().max_tokens).toBe(2256);});
 it('preserves range budget',async()=>{await llmRange('Rome',2026);expect(body().max_tokens).toBe(406);});
 it('preserves narrative budget and streaming reasoning settings',async()=>{
  fetchMock.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"A history."}}]}\n\ndata: [DONE]\n\n'));
  const chunks=[];for await(const chunk of llmNarrative('Rome',{start:1,end:2000},[]))chunks.push(chunk);
  expect(chunks.join('')).toBe('A history.');expect(body()).toMatchObject({model:'openai/gpt-oss-120b',max_tokens:1756,stream:true,reasoning_effort:'low',include_reasoning:false});
 });
});


describe('provider stream failure handling', () => {
  async function collectStream() {
    const chunks: string[] = [];
    for await (const delta of stream({ messages: [] })) chunks.push(delta);
    return chunks;
  }

  it('rejects streamed provider errors even when followed by DONE', async () => {
    fetchMock.mockResolvedValue(new Response('data: {"error":{"message":"provider stream failed","type":"server_error"}}\n\ndata: [DONE]\n\n'));
    await expect(collectStream()).rejects.toThrow('Groq stream error (server_error): provider stream failed');
  });

  it('rejects premature EOF after partial output', async () => {
    fetchMock.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Partial."}}]}\n\n'));
    await expect(collectStream()).rejects.toThrow('Groq stream ended before [DONE]');
  });

  it('rejects a missing response body', async () => {
    fetchMock.mockResolvedValue(new Response(null));
    await expect(collectStream()).rejects.toThrow('Groq stream ended before [DONE]');
  });

  it('keeps valid deltas ordered across byte boundaries and ignores keep-alives', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(': keep-alive\n\ndata: invalid-json\n\ndata: {"choices":[{"delta":{"content":"Ancient "}}]}\n\ndata: {"choices":[{"delta":{"content":"Romé."}}]}\n\ndata: [DONE]\n\n');
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        for (const byte of data) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    })));
    await expect(collectStream()).resolves.toEqual(['Ancient ', 'Romé.']);
  });
});
