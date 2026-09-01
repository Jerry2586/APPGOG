export function validHlsUrl(input:string){
  if(/[\u0000-\u0020\u007f\\]/.test(input))return false;
  try {const url=new URL(input);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&/\.m3u8$/i.test(url.pathname)}catch{return false}
}
