import { describe, expect, it } from 'vitest';
import { claimPopup, marketingWindow, matchesPage, operationIso, themeStyles, THEME_DARK, zonedTimestamp } from './operations-client';
describe('stage11 theme, IANA dates and persistent campaign rules', () => {
  it('switches modes while preserving brand and resetting stale neutral colors', () => {
    const theme={mode:'DARK',variables:{...THEME_DARK,bg:'#000000',primary:'#ff1234'}};
    const light=themeStyles(theme,'light',true);expect(light.mode).toBe('light');expect(light.style['--primary']).toBe('#ff1234');expect(light.style['--bg']).not.toBe('#000000');
    expect(themeStyles({mode:'AUTO',variables:{}},'',false).mode).toBe('light');
    expect(themeStyles(null,'',true).style['--primary']).toBe(THEME_DARK.primary);
  });
  it('filters malicious legacy CSS values and unrecognized keys on the client too',()=>{
    const result=themeStyles({mode:'DARK',variables:{bg:'url(https://evil.invalid)',radius:'9999px',shadow:'url(x)',display:'none'}},'',true);
    expect(result.style['--bg']).toBe(THEME_DARK.bg);expect(result.style['--display']).toBeUndefined();
  });
  it('converts Shanghai and explicit offsets to the same instant',()=>{expect(operationIso('2030-01-01T00:00:00','Asia/Shanghai')).toBe('2029-12-31T16:00:00.000Z');expect(operationIso('2030-01-01T00:00:00+08:00','UTC')).toBe('2029-12-31T16:00:00.000Z')});
  it.each(['2026-03-08T02:30:00','2026-11-01T01:30:00','2026-02-30T01:00:00'])('rejects nonexistent or ambiguous local wall time %s',value=>{expect(Number.isNaN(zonedTimestamp(value,'America/New_York'))).toBe(true)});
  it('accepts explicit side of autumn DST overlap, rejects invalid zones',()=>{expect(operationIso('2026-11-01T01:30:00-04:00','America/New_York')).toBe('2026-11-01T05:30:00.000Z');expect(()=>operationIso('2030-01-01T00:00:00','bad/zone')).toThrow()});
  it('uses half-open windows and excludes not-started/expired/invalid values',()=>{
    const start='2030-01-01T00:00:00Z',end='2030-01-02T00:00:00Z';expect(marketingWindow(start,end,'UTC',Date.parse(start)).active).toBe(true);expect(marketingWindow(start,end,'UTC',Date.parse(end)).active).toBe(false);expect(marketingWindow(start,end,'UTC',Date.parse(end)).expired).toBe(true);expect(marketingWindow('invalid',end,'UTC',Date.now()).valid).toBe(false);
  });
  it('matches exact path and prefixes while excluding admin',()=>{expect(matchesPage('/help,/content/*','/content/a')).toBe(true);expect(matchesPage('/help','/help/a')).toBe(false);expect(matchesPage('*','/admin')).toBe(false);expect(matchesPage('*','/')).toBe(true)});
  it('shares popup frequency across instances and honors persisted values',()=>{
    const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v)}};
    const now=Date.parse('2030-01-01T00:00:00Z');expect(claimPopup('persist',24,now,storage)).toBe(true);expect(claimPopup('persist',24,now+1000,storage)).toBe(false);expect(claimPopup('persist',24,now+86400000,storage)).toBe(true);
    values.set('other-tab',String(now));expect(claimPopup('other-tab',24,now+1000,storage)).toBe(false);
  });
  it('degrades unavailable storage to same-document frequency without crashing',()=>{const blocked={getItem:()=>{throw Error()},setItem:()=>{throw Error()}};expect(claimPopup('blocked',1,100000,blocked)).toBe(true);expect(claimPopup('blocked',1,101000,blocked)).toBe(false)});
});
