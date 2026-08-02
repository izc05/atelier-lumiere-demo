(() => {
  const ORDER_LABELS = Object.freeze({PENDING_CONFIRMATION:"Pendiente de confirmar",ACCEPTED:"Aceptado",IN_PRODUCTION:"En elaboración",READY_TO_SHIP:"Listo para enviar",SHIPPED:"Enviado",DELIVERED:"Entregado",INCIDENT:"Con incidencia",CANCELLED:"Cancelado"});
  const ORDER_CLASSES = Object.freeze({PENDING_CONFIRMATION:"pending",ACCEPTED:"accepted",IN_PRODUCTION:"production",READY_TO_SHIP:"ready",SHIPPED:"shipped",DELIVERED:"delivered",INCIDENT:"incident",CANCELLED:"cancelled"});
  const REQUEST_LABELS = Object.freeze({OPEN:"Abierto",NEEDS_INFO:"Falta información",QUOTED:"Presupuesto pendiente",APPROVED:"Presupuesto aprobado",IN_PROGRESS:"En elaboración",COMPLETED:"Completado",CANCELLED:"Cancelado"});
  const REQUEST_CLASSES = Object.freeze({OPEN:"open",NEEDS_INFO:"needs-info",QUOTED:"quoted",APPROVED:"approved",IN_PROGRESS:"progress",COMPLETED:"completed",CANCELLED:"cancelled"});
  function byId(id){return document.getElementById(id)}
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function money(cents,currency="EUR"){return Number.isInteger(cents)?new Intl.NumberFormat("es-ES",{style:"currency",currency}).format(cents/100):"Pendiente"}
  function date(value,withTime=false){if(!value)return"Sin fecha";try{return new Intl.DateTimeFormat("es-ES",withTime?{dateStyle:"medium",timeStyle:"short"}:{dateStyle:"medium"}).format(new Date(value))}catch{return"Sin fecha"}}
  function badge(status,type="order"){const labels=type==="request"?REQUEST_LABELS:ORDER_LABELS;const classes=type==="request"?REQUEST_CLASSES:ORDER_CLASSES;return element("span",`status ${classes[status]??"pending"}`,labels[status]??status)}
  async function requestJson(path,options={}){const response=await fetch(path,{...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers??{})}});const payload=await response.json().catch(()=>({}));if(response.status===401){window.location.replace("/pedido/acceso/");throw new Error("La sesión ha caducado.")}if(!response.ok){const error=new Error(payload.message||"No se pudo completar la operación.");error.code=payload.error;error.details=payload.details;throw error}return payload}
  function fact(text){return element("span","",text)}
  function keyValue(label,value){const row=element("div","key-value");row.append(element("span","",label),element("strong","",value||"No indicado"));return row}
  function queryUuid(name){const value=new URLSearchParams(location.search).get(name)??"";return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():null}
  function setMessage(node,text,type=""){node.textContent=text;node.className=`message${type?` ${type}`:""}`}
  function wireLogout(){const button=byId("logout-button");if(!button)return;button.addEventListener("click",async()=>{button.disabled=true;button.textContent="Cerrando…";try{await fetch("/internal/customer/session",{method:"DELETE"})}finally{location.replace("/pedido/acceso/")}})}
  window.AtelierCustomerOrders=Object.freeze({ORDER_LABELS,REQUEST_LABELS,byId,element,money,date,badge,requestJson,fact,keyValue,queryUuid,setMessage,wireLogout});
})();
