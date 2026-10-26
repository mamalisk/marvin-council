export function allowLocalDiagnostic(url:string,origin:string|null,production:boolean,host?:string|null){
  if(production)return false;
  try{
    const internal=new URL(url);
    // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
    // Use the actual Host header for same-origin validation, never forwarded headers.
    if(host&&(/[\s/@\\?#]/.test(host)))return false;
    const u=host?new URL(`${internal.protocol}//${host}`):internal;
    return ["localhost","127.0.0.1","[::1]"].includes(u.hostname)&&origin===u.origin;
  }catch{return false;}
}
