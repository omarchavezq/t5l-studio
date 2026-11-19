// Español de Perú, neutro y corto, para la tabla de idiomas.
// Traduce términos habituales de HMI desde inglés o chino; lo demás queda vacío.

import type { LanguageTable } from './multilanguage';

export const SPANISH_PE = 'Español (Perú)';

// [español, inglés…, chino…]
const TERMS: [string, string[], string[]][] = [
  ['Aceptar', ['ok', 'accept', 'enter'], ['确定', '确认']],
  ['Cancelar', ['cancel'], ['取消']],
  ['Confirmar', ['confirm'], ['确认操作']],
  ['Sí', ['yes'], ['是']],
  ['No', ['no'], ['否']],
  ['Guardar', ['save'], ['保存', '存储']],
  ['Borrar', ['delete', 'clear', 'del'], ['删除', '清除']],
  ['Editar', ['edit', 'modify'], ['编辑', '修改']],
  ['Agregar', ['add', 'new'], ['添加', '新增', '新建']],
  ['Buscar', ['search', 'find', 'query'], ['搜索', '查询', '查找']],
  ['Salir', ['exit', 'quit'], ['退出']],
  ['Menú', ['menu', 'main menu'], ['菜单', '主菜单']],
  ['Inicio', ['home', 'main', 'main page', 'start page'], ['主页', '首页', '主界面']],
  ['Atrás', ['back', 'return'], ['返回']],
  ['Siguiente', ['next', 'next page'], ['下一页', '下一步']],
  ['Anterior', ['previous', 'prev', 'previous page'], ['上一页', '上一步']],
  ['Subir', ['up'], ['上']],
  ['Bajar', ['down'], ['下']],
  ['Izquierda', ['left'], ['左']],
  ['Derecha', ['right'], ['右']],
  ['Encendido', ['on'], ['开']],
  ['Apagado', ['off'], ['关']],
  ['Encender', ['power on', 'turn on'], ['开机', '打开电源']],
  ['Apagar', ['power off', 'turn off', 'shutdown'], ['关机']],
  ['Abrir', ['open'], ['打开']],
  ['Cerrar', ['close'], ['关闭']],
  ['Arrancar', ['start', 'run'], ['启动', '开始']],
  ['Parar', ['stop'], ['停止']],
  ['Pausa', ['pause'], ['暂停']],
  ['Continuar', ['continue', 'resume'], ['继续']],
  ['Restablecer', ['reset'], ['复位', '重置']],
  ['Reiniciar', ['restart', 'reboot'], ['重启']],
  ['Bloquear', ['lock'], ['锁定']],
  ['Desbloquear', ['unlock'], ['解锁']],
  ['Ingresar', ['login', 'log in', 'sign in'], ['登录']],
  ['Cerrar sesión', ['logout', 'log out', 'sign out'], ['注销', '退出登录']],
  ['Usuario', ['user', 'username'], ['用户', '用户名']],
  ['Contraseña', ['password'], ['密码']],
  ['Configuración', ['settings', 'setting', 'setup', 'config', 'configuration'], ['设置', '设定', '配置']],
  ['Parámetros', ['parameters', 'parameter', 'params'], ['参数', '参数设置']],
  ['Sistema', ['system'], ['系统']],
  ['Información', ['info', 'information', 'about'], ['信息', '关于']],
  ['Ayuda', ['help'], ['帮助']],
  ['Versión', ['version'], ['版本']],
  ['Idioma', ['language'], ['语言']],
  ['Brillo', ['brightness', 'backlight'], ['亮度', '背光']],
  ['Volumen', ['volume'], ['音量']],
  ['Sonido', ['sound', 'buzzer'], ['声音', '蜂鸣器']],
  ['Fecha', ['date'], ['日期']],
  ['Hora', ['clock'], ['时钟']],
  ['Tiempo', ['time', 'timer'], ['时间', '定时']],
  ['Fecha y hora', ['date & time', 'date and time', 'date/time'], ['日期时间']],
  ['Estado', ['status', 'state'], ['状态']],
  ['Manual', ['manual'], ['手动']],
  ['Automático', ['auto', 'automatic'], ['自动']],
  ['Modo', ['mode'], ['模式']],
  ['En marcha', ['running'], ['运行', '运行中']],
  ['Detenido', ['stopped'], ['已停止']],
  ['Listo', ['ready', 'done', 'finished', 'complete'], ['就绪', '完成']],
  ['Espere', ['please wait', 'wait', 'loading'], ['请稍候', '加载中']],
  ['Normal', ['normal'], ['正常']],
  ['Falla', ['fault', 'failure'], ['故障']],
  ['Error', ['error'], ['错误']],
  ['Alarma', ['alarm'], ['报警', '警报']],
  ['Advertencia', ['warning'], ['警告']],
  ['Aviso', ['notice', 'tip', 'prompt'], ['提示']],
  ['Historial', ['history', 'log', 'records'], ['历史', '记录', '历史记录']],
  ['Alto', ['high'], ['高']],
  ['Bajo', ['low'], ['低']],
  ['Medio', ['medium', 'mid'], ['中']],
  ['Máximo', ['max', 'maximum'], ['最大', '最大值']],
  ['Mínimo', ['min', 'minimum'], ['最小', '最小值']],
  ['Valor', ['value'], ['数值', '值']],
  ['Valor actual', ['current value', 'actual value', 'pv'], ['当前值', '实际值']],
  ['Punto de ajuste', ['set point', 'setpoint', 'set value', 'sv'], ['设定值']],
  ['Límite', ['limit'], ['限值', '极限']],
  ['Total', ['total'], ['总计', '合计']],
  ['Contador', ['counter', 'count'], ['计数', '计数器']],
  ['Calibración', ['calibration', 'calibrate'], ['校准', '校正']],
  ['Prueba', ['test'], ['测试']],
  ['Temperatura', ['temperature', 'temp'], ['温度']],
  ['Humedad', ['humidity'], ['湿度']],
  ['Presión', ['pressure'], ['压力']],
  ['Velocidad', ['speed'], ['速度', '转速']],
  ['Nivel', ['level'], ['液位', '水位']],
  ['Peso', ['weight'], ['重量']],
  ['Caudal', ['flow', 'flow rate'], ['流量']],
  ['Potencia', ['power'], ['功率']],
  ['Voltaje', ['voltage'], ['电压']],
  ['Corriente', ['current'], ['电流']],
  ['Frecuencia', ['frequency'], ['频率']],
  ['Energía', ['energy'], ['能量', '电量']],
  ['Motor', ['motor'], ['电机', '马达']],
  ['Bomba', ['pump'], ['水泵', '泵']],
  ['Ventilador', ['fan'], ['风扇', '风机']],
  ['Válvula', ['valve'], ['阀门', '阀']],
  ['Calefacción', ['heating', 'heater', 'heat'], ['加热']],
  ['Enfriamiento', ['cooling', 'cool'], ['制冷', '冷却']],
  ['Horno', ['oven'], ['烤箱', '烘箱']],
  ['Luz', ['light', 'lamp'], ['灯', '照明']],
  ['Puerta', ['door'], ['门']],
  ['Programa', ['program'], ['程序']],
  ['Receta', ['recipe'], ['配方']],
  ['Paso', ['step'], ['步骤']],
  ['Ciclo', ['cycle'], ['循环', '周期']],
  ['Producción', ['production'], ['生产']],
  ['Mantenimiento', ['maintenance'], ['维护', '保养']],
  ['Diagnóstico', ['diagnostics', 'diagnosis'], ['诊断']],
  ['Red', ['network'], ['网络']],
  ['Comunicación', ['communication'], ['通讯', '通信']],
  ['Conectado', ['connected'], ['已连接']],
  ['Desconectado', ['disconnected'], ['未连接', '断开']],
];

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

const DICT = new Map<string, string>();
for (const [es, en, zh] of TERMS) for (const k of [...en, ...zh]) DICT.set(norm(k), es);

/** Traduce un texto de HMI; conserva «:» final y mayúsculas sostenidas. null si no lo conoce. */
export function toSpanishPe(text: string): string | null {
  const m = /^(.*?)([:：]?)\s*$/s.exec(text.trim());
  if (!m || !m[1]) return null;
  const es = DICT.get(norm(m[1]));
  if (!es) return null;
  const upper = /[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase() && m[1].length > 1;
  return (upper ? es.toUpperCase() : es) + (m[2] ? ':' : '');
}

/** Agrega la columna «Español (Perú)» (o completa la de español que exista) con lo que se pueda traducir. */
export function addSpanishPe(t: LanguageTable): { table: LanguageTable; filled: number; missing: number } {
  let col = t.languages.findIndex((l) => /^espa(ñ|n)ol/i.test(l.trim()) || /^es([-_]|$)/i.test(l.trim()));
  const table: LanguageTable = structuredClone(t);
  if (col < 0) {
    col = table.languages.length;
    table.languages.push(SPANISH_PE);
    for (const r of table.rows) r.texts.push('');
  }
  let filled = 0;
  let missing = 0;
  for (const r of table.rows) {
    if (r.texts[col]?.trim()) continue;
    const es = r.texts.map((s, i) => (i === col || !s.trim() ? null : toSpanishPe(s))).find((s) => s);
    if (es) {
      r.texts[col] = es;
      filled++;
    } else missing++;
  }
  return { table, filled, missing };
}
