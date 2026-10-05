let runtimeEnv=null;

export function setRuntimeEnv(env){
  runtimeEnv=env||null;
}
export function getRuntimeEnv(){
  return runtimeEnv;
}
export function runtimeBinding(name){
  return runtimeEnv&&name?runtimeEnv[name]:undefined;
}
