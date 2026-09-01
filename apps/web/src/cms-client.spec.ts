import {describe,it,expect} from 'vitest';
import {categoryOptions,contentPayload,emptyContent} from './cms-client';
import {validHlsUrl} from './video-source';
describe('stage 8 CMS frontend helpers',()=>{
  it('flattens unlimited categories in sort order and excludes entire move target subtree',()=>{const nodes=Array.from({length:2000},(_,i)=>({id:String(i),name:'分类',slug:String(i),parentId:i?String(i-1):null,scope:'CONTENT',sort:0,revision:1}));expect(categoryOptions(nodes)[1999].depth).toBe(1999);expect(categoryOptions(nodes,'1')).toHaveLength(1);expect(categoryOptions(nodes,'0')).toHaveLength(0)});
  it('whitelists draft fields and includes concurrency version, not public or audit metadata',()=>{const data=contentPayload({...emptyContent(),id:'x',revision:4,categoryId:null,publishedSnapshot:{title:'线上'},status:'PUBLISHED',indexJobs:[]});expect(data.baseRevision).toBe(4);expect(data.categoryId).toBe('');expect(data.status).toBeUndefined();expect(data.publishedSnapshot).toBeUndefined();expect(data.indexJobs).toBeUndefined()});
  it('supports signed HLS but rejects non-HLS and unsafe protocols',()=>{expect(validHlsUrl('https://example.com/video.M3U8?sig=x')).toBe(true);for(const src of ['javascript:alert(1)','https://example.com/video.mp4','/video.m3u8','https://x:y@example.com/video.m3u8','https:\\example.com/video.m3u8'])expect(validHlsUrl(src)).toBe(false)});
});
