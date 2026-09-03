import 'server-only';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import { fechaDePlanilla as fecha, normalizarEncabezado as normalizar, numeroDePlanilla as numero, parsearCsv } from '@/lib/csv';
import type {
  AsistenciaMentoria, Autoridad, Cliente, EstrategiaVersion,
  Mentoria, Negocio, ObjetivoComercial, Pago,
} from '@/domain/types';
import {
  ASISTENCIAS, CAMPOS_DE_FICHA, CLIENTES, CUOTAS, ESTADO_CLIENTE, ESTADO_DEUDA, ESTADO_PAGO,
  MENTORIAS, MONEDA_POR_DEFECTO, PAGOS, SOLAPAS, type Mapeo,
} from './planilla-mapeo';

/**
 * LA PLANILLA CONSOLIDADA
 *
 * Una sola planilla en Drive con cuatro solapas, y la app la lee. La regla del
 * paquete es "no migrar nada de lugar": el equipo sigue trabajando donde ya
 * trabaja y acá se sincroniza, en vez de pedirle a nadie que cargue dos veces.
 *
 * Tres reglas de ingesta que no se negocian:
 *
 *  1. Celda vacía ≠ cero. Vacío es `null`. Un cero significa que se midió y dio
 *     cero; vacío significa que nadie lo midió. La diferencia es todo el
 *     diagnóstico.
 *  2. Fila con cliente no identificable: se saltea y se informa. No se inventa
 *     y no se adivina por parecido de nombre.
 *  3. Nada de lo que el consultor carga en la app se pisa desde la planilla:
 *     las métricas semanales, las sesiones, los reportes, los compromisos, las
 *     lecturas y las alertas no se tocan acá.
 */

export function hayPlanilla(): boolean {
  return Boolean(process.env.SHEETS_PLANILLA_ID);
}

/**
 * Se lee por el export CSV de Google, que no necesita service account: alcanza
 * con que la planilla esté compartida como "cualquiera con el enlace puede
 * ver". Es una integración menos que mantener y funciona en WebContainer,
 * donde no hay forma de firmar un JWT con librerías nativas.
 */
function urlSolapa(solapa: string): string {
  const id = process.env.SHEETS_PLANILLA_ID;
  // El `gid` es el identificador estable de la solapa y no cambia si alguien
  // la renombra. Es la forma robusta de apuntar a una: se usa si está
  // configurado, y el nombre queda como camino por defecto.
  const gid = process.env.SHEETS_GID_CLIENTES;
  const donde = gid ? `gid=${encodeURIComponent(gid)}` : `sheet=${encodeURIComponent(solapa)}`;
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&${donde}`;
}

type Fila = Record<string, string>;

function aFilas(csv: string[][]): Fila[] {
  if (!csv.length) return [];
  const encabezados = csv[0].map(normalizar);
  return csv.slice(1).map((f) => {
    const o: Fila = {};
    encabezados.forEach((h, i) => {
      if (h && o[h] === undefined) o[h] = (f[i] ?? '').trim();
    });
    return o;
  });
}

/** Busca el valor de un campo probando todos sus alias. */
function campo(fila: Fila, alias: string[]): string {
  for (const a of alias) {
    const v = fila[normalizar(a)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}
const leer = (fila: Fila, mapeo: Mapeo, key: string) => campo(fila, mapeo[key] ?? []);

// ------------------------------------------------------------- conversiones

const opcional = (v: string) => (v.trim() === '' ? undefined : v.trim());

const booleano = (v: string): boolean => ['si', 'sí', 'true', 'x', '1', 'yes', 'ok'].includes(normalizar(v));


// ------------------------------------------------------------------ reporte

export type ReporteSolapa = {
  solapa: string;
  leidas: number;
  aplicadas: number;
  salteadas: { fila: number; motivo: string }[];
  error?: string;
  /** Aclaración que no es un fallo: la solapa no está configurada. */
  nota?: string;
  /**
   * Cuántos quedaron para la próxima corrida. Una importación que se corta por
   * tiempo no es un error, pero callarlo sí: sin este número nadie sabe si lo
   * que está mirando es la cartera entera o los primeros veinticinco.
   */
  restantes?: number;
};
export type Reporte = { at: string; solapas: ReporteSolapa[] };

/** Una solapa sin nombre configurado no es un error: es una que no existe. */
function solapaAusente(solapa: string, que: string): ReporteSolapa {
  return {
    solapa: `(sin solapa de ${que})`,
    leidas: 0,
    aplicadas: 0,
    salteadas: [],
    error: undefined,
    nota: `La planilla no tiene una solapa de ${que}. Si algún día la tenés, nombrala en la variable de entorno correspondiente.`,
  };
}

async function bajar(solapa: string): Promise<Fila[]> {
  const res = await fetch(urlSolapa(solapa), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No existe la solapa «${solapa}», o la planilla no está compartida como "cualquiera con el enlace puede ver".`
        : `Google devolvió ${res.status} al leer «${solapa}».`,
    );
  }
  const texto = await res.text();
  if (texto.trimStart().startsWith('<')) {
    throw new Error(
      `Google devolvió HTML en vez de CSV para «${solapa}». Casi siempre es que la planilla no está compartida por enlace.`,
    );
  }
  return aFilas(parsearCsv(texto));
}

/**
 * Google tiene un comportamiento cruel acá: si le pedís una solapa que no
 * existe, **no devuelve un error, devuelve la primera solapa**. Sin esta
 * verificación eso se ve como una importación que corrió bien y saltó las 26
 * filas «sin nombre de cliente» — un reporte que manda a arreglar la planilla
 * cuando la planilla está perfecta y lo que está mal es a cuál se apuntó.
 *
 * Si ninguna columna se parece a un nombre de cliente, no es la solapa.
 */
function verificarQueSeaLaSolapa(filas: Fila[], solapa: string): void {
  if (!filas.length) return;
  const columnas = Object.keys(filas[0]).filter(Boolean);
  const alias = (CLIENTES.nombre ?? []).map(normalizar);
  if (columnas.some((c) => alias.includes(c))) return;

  throw new Error(
    `La solapa que se leyó no tiene ninguna columna de nombre de cliente. Sus columnas son: ` +
      `${columnas.slice(0, 8).join(', ')}${columnas.length > 8 ? '…' : ''}. ` +
      `Casi seguro se está leyendo otra: si el nombre pedido no existe, Google devuelve la primera solapa sin avisar. ` +
      `Se pidió «${solapa}» — revisá que exista con ese nombre exacto, o que la variable SHEETS_SOLAPA_CLIENTES no esté apuntando a otra. ` +
      `También podés fijar la solapa por su gid con SHEETS_GID_CLIENTES, que no depende del nombre.`,
  );
}

/**
 * LOS CUATRO BLOQUES DEL EXPEDIENTE DE UNA FILA
 *
 * Vive afuera del bucle de clientes porque lo usan dos solapas: la de finanzas
 * —donde alguien puede haber agregado columnas del expediente al final— y la
 * solapa «Ficha», que existe justamente para poder cargar los 32 campos de una
 * tabla sin ensuciar la planilla de finanzas ni tocar ninguna configuración.
 *
 * La regla que gobierna las tres escrituras es la misma: **celda vacía es «sin
 * dato», nunca «borrá lo que sabías»**. Los bloques se guardan enteros, así que
 * sin la fusión una tabla parcial —que es la forma normal de cargar por
 * tandas— borraba lo que había cargado la tanda anterior.
 */
async function escribirExpediente(
  f: Fila,
  id: string,
  dataset: Awaited<ReturnType<ReturnType<typeof getRepo>['cargarTodo']>>,
  repo: ReturnType<typeof getRepo>,
  hoy: string,
): Promise<void> {
    const moneda = opcional(leer(f, CLIENTES, 'moneda')) ?? MONEDA_POR_DEFECTO;

    /**
     * --- negocio
     *
     * Se fusiona con lo que ya había. Es la misma regla que rige la fila del
     * cliente y hay que decir por qué: el bloque se guarda entero, así que
     * subir una tabla con «a quién» pero sin «qué vende» reemplazaba el
     * bloque completo y dejaba en null lo que alguien había cargado a mano.
     *
     * Celda vacía es «sin dato», nunca «borrá lo que sabías». Sin esto, una
     * planilla parcial —que es la forma normal de cargar por tandas— es una
     * herramienta de pérdida de datos silenciosa.
     */
    const negocioPrevio = dataset.negocios.find((n) => n.clienteId === id);
    const negocioFila = {
      queVende: opcional(leer(f, CLIENTES, 'queVende')),
      aQuien: opcional(leer(f, CLIENTES, 'aQuien')),
      precio: numero(leer(f, CLIENTES, 'negocioPrecio')) ?? undefined,
      comoEntrega: opcional(leer(f, CLIENTES, 'comoEntrega')),
      facturacionMensual: numero(leer(f, CLIENTES, 'facturacionMensual')) ?? undefined,
      cantidadClientes: numero(leer(f, CLIENTES, 'cantidadClientes')) ?? undefined,
      origenClientes: opcional(leer(f, CLIENTES, 'origenClientes')),
      queFunciono: opcional(leer(f, CLIENTES, 'queFunciono')),
      queNoFunciono: opcional(leer(f, CLIENTES, 'queNoFunciono')),
    };
    if (Object.values(negocioFila).some((x) => x !== undefined)) {
      const negocio: Negocio = {
        ...negocioPrevio,
        clienteId: id,
        queVende: negocioFila.queVende ?? negocioPrevio?.queVende,
        aQuien: negocioFila.aQuien ?? negocioPrevio?.aQuien,
        precio: negocioFila.precio ?? negocioPrevio?.precio,
        moneda: opcional(leer(f, CLIENTES, 'moneda')) ?? negocioPrevio?.moneda ?? moneda,
        comoEntrega: negocioFila.comoEntrega ?? negocioPrevio?.comoEntrega,
        facturacionMensual: negocioFila.facturacionMensual ?? negocioPrevio?.facturacionMensual,
        cantidadClientes: negocioFila.cantidadClientes ?? negocioPrevio?.cantidadClientes,
        origenClientes: negocioFila.origenClientes ?? negocioPrevio?.origenClientes,
        queFunciono: negocioFila.queFunciono ?? negocioPrevio?.queFunciono,
        queNoFunciono: negocioFila.queNoFunciono ?? negocioPrevio?.queNoFunciono,
        actualizadoAt: hoy,
      };
      await repo.guardarNegocio(negocio);
    }

    // --- autoridad · misma regla que negocio: vacío no borra
    const autoridadPrevia = dataset.autoridades.find((a) => a.clienteId === id);
    const industrias = leer(f, CLIENTES, 'industriasQueConoce');
    const autoridadFila = {
      haceExcepcionalmenteBien: opcional(leer(f, CLIENTES, 'haceExcepcionalmenteBien')),
      experienciaProfesional: opcional(leer(f, CLIENTES, 'experienciaProfesional')),
      resultadosPropios: opcional(leer(f, CLIENTES, 'resultadosPropios')),
      resultadosTerceros: opcional(leer(f, CLIENTES, 'resultadosTerceros')),
      industriasQueConoce: industrias
        ? industrias.split(',').map((x) => x.trim()).filter(Boolean)
        : undefined,
      autoridadDesperdiciada: opcional(leer(f, CLIENTES, 'autoridadDesperdiciada')),
    };
    if (Object.values(autoridadFila).some((x) => x !== undefined)) {
      const autoridad: Autoridad = {
        ...autoridadPrevia,
        clienteId: id,
        haceExcepcionalmenteBien: autoridadFila.haceExcepcionalmenteBien ?? autoridadPrevia?.haceExcepcionalmenteBien,
        experienciaProfesional: autoridadFila.experienciaProfesional ?? autoridadPrevia?.experienciaProfesional,
        resultadosPropios: autoridadFila.resultadosPropios ?? autoridadPrevia?.resultadosPropios,
        resultadosTerceros: autoridadFila.resultadosTerceros ?? autoridadPrevia?.resultadosTerceros,
        industriasQueConoce: autoridadFila.industriasQueConoce ?? autoridadPrevia?.industriasQueConoce ?? [],
        autoridadDesperdiciada: autoridadFila.autoridadDesperdiciada ?? autoridadPrevia?.autoridadDesperdiciada,
        actualizadoAt: hoy,
      };
      await repo.guardarAutoridad(autoridad);
    }

    // --- estrategia · append-only, sólo si cambió algo
    const previa = dataset.estrategias.filter((e) => e.clienteId === id).at(-1);
    const est = {
      clienteIdeal: opcional(leer(f, CLIENTES, 'clienteIdeal')),
      problema: opcional(leer(f, CLIENTES, 'problema')),
      deseo: opcional(leer(f, CLIENTES, 'deseo')),
      promesa: opcional(leer(f, CLIENTES, 'promesa')),
      oferta: opcional(leer(f, CLIENTES, 'oferta')),
      mecanismo: opcional(leer(f, CLIENTES, 'mecanismo')),
      canal: opcional(leer(f, CLIENTES, 'canal')),
      precio: numero(leer(f, CLIENTES, 'estrategiaPrecio')) ?? undefined,
    };
    const hayEstrategia = Object.values(est).some((x) => x !== undefined);
    /**
     * La versión nueva arranca de la anterior y le pisa sólo lo que trae la
     * fila. Acá el error era peor que en los otros dos bloques: una tabla
     * parcial creaba una v2 con los campos que faltaban vacíos, y esa v2 es
     * la vigente — la que el diagnóstico usa y contra la que el test de
     * coherencia compara el drift. Se perdía la estrategia y encima quedaba
     * registrado como si alguien la hubiera cambiado a propósito.
     */
    const fusion = {
      clienteIdeal: est.clienteIdeal ?? previa?.clienteIdeal,
      problema: est.problema ?? previa?.problema,
      deseo: est.deseo ?? previa?.deseo,
      promesa: est.promesa ?? previa?.promesa,
      oferta: est.oferta ?? previa?.oferta,
      mecanismo: est.mecanismo ?? previa?.mecanismo,
      canal: est.canal ?? previa?.canal,
      precio: est.precio ?? previa?.precio,
    };
    const cambio = !previa || (Object.keys(fusion) as (keyof typeof fusion)[]).some(
      (k) => fusion[k] !== ((previa as unknown as Record<string, unknown>)[k] ?? undefined),
    );
    if (hayEstrategia && cambio) {
      const nueva: EstrategiaVersion = {
        id: nuevoId(),
        clienteId: id,
        version: (previa?.version ?? 0) + 1,
        ...fusion,
        moneda: opcional(leer(f, CLIENTES, 'moneda')) ?? previa?.moneda ?? moneda,
        vigenteDesde: hoy,
        motivoCambio: opcional(leer(f, CLIENTES, 'motivoCambio')) ?? 'Importado de la planilla',
        iniciativa: 'consultora',
      };
      await repo.guardarEstrategia(nueva);
    }

    // --- objetivo comercial
    const meta = numero(leer(f, CLIENTES, 'metaMensual'));
    const ticket = numero(leer(f, CLIENTES, 'ticket'));
    const objPrevio = dataset.objetivos.filter((o) => o.clienteId === id).at(-1);
    if (meta !== null && ticket !== null &&
        (!objPrevio || objPrevio.metaMensual !== meta || objPrevio.ticket !== ticket)) {
      const objetivo: ObjetivoComercial = {
        id: nuevoId(),
        clienteId: id,
        metaMensual: meta,
        ticket,
        moneda,
        tasaCierre: objPrevio?.tasaCierre ?? 0.25,
        tasaAsistencia: objPrevio?.tasaAsistencia ?? 0.7,
        tasaAgendamiento: objPrevio?.tasaAgendamiento ?? 0.2,
        tasaAvance: objPrevio?.tasaAvance ?? 0.3,
        tasaDmSobreAlcance: objPrevio?.tasaDmSobreAlcance ?? 0.02,
        diaInicioProspeccion: objPrevio?.diaInicioProspeccion ?? 14,
        vigenteDesde: hoy,
      };
      await repo.guardarObjetivo(objetivo);
    }
}

// ---------------------------------------------------------------- sincronía

export async function sincronizar(hoy: string): Promise<Reporte> {
  if (!hayPlanilla()) {
    return { at: hoy, solapas: [{ solapa: '—', leidas: 0, aplicadas: 0, salteadas: [], error: 'Falta SHEETS_PLANILLA_ID.' }] };
  }

  const repo = getRepo();
  const dataset = await repo.cargarTodo(hoy);
  const porNombre = new Map(dataset.clientes.map((c) => [normalizar(c.nombre), c]));

  /**
   * Las cuotas que ya existen, por cliente y número. Sin esto cada
   * sincronización creaba filas nuevas con id nuevo —`guardarPago` inserta por
   * id— y la segunda corrida duplicaba la deuda entera de la cartera. Reusando
   * el id, volver a sincronizar corrige en vez de acumular.
   */
  const pagoExistente = new Map<string, string>();
  for (const p of dataset.pagos) pagoExistente.set(`${p.clienteId}#${p.numeroCuota}`, p.id);
  const consultoraPorNombre = new Map(dataset.equipo.map((c) => [normalizar(c.nombre), c.id]));

  const solapas: ReporteSolapa[] = [];

  // ------------------------------------------------------------ 1 · clientes
  const rc: ReporteSolapa = { solapa: SOLAPAS.clientes, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.clientes);
    rc.leidas = filas.length;
    verificarQueSeaLaSolapa(filas, SOLAPAS.clientes);

    /**
     * Una segunda fila con el mismo nombre es una RENOVACIÓN: en la planilla de
     * finanzas cada contrato es una fila, con su monto y sus cuotas. Antes se
     * salteaba, y eso perdía justo las cuotas del contrato nuevo, que son las
     * que están vivas.
     *
     * Se acumulan: mismo cliente, sus cuotas se suman a las que ya tenía y
     * queda registrado que renovó. La fecha de alta no se toca — el día 1 del
     * programa es el del primer contrato.
     *
     * El riesgo asumido es el homónimo: dos personas distintas con el mismo
     * nombre se fusionarían. Por eso cada renovación se informa con su número
     * de fila, para que alguien la mire una vez.
     */
    const vistos = new Set<string>();
    /** Cuántas cuotas lleva cada cliente en esta corrida, para numerar las que siguen. */
    const cuotasDe = new Map<string, number>();

    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, CLIENTES, 'nombre');
      if (!nombre) { rc.salteadas.push({ fila: i + 2, motivo: 'Sin nombre de cliente.' }); continue; }

      const clave = normalizar(nombre);
      const esRenovacion = vistos.has(clave);
      vistos.add(clave);

      const previo = porNombre.get(clave);
      const id = previo?.id ?? nuevoId();
      const altaFila = fecha(leer(f, CLIENTES, 'fechaAlta'));
      const alta = esRenovacion ? (previo?.fechaAlta ?? altaFila) : (altaFila ?? previo?.fechaAlta);
      if (!alta) { rc.salteadas.push({ fila: i + 2, motivo: `«${nombre}» no tiene fecha de alta y es cliente nuevo.` }); continue; }

      if (esRenovacion) {
        rc.salteadas.push({
          fila: i + 2,
          motivo: `«${nombre}» aparece por segunda vez: se tomó como RENOVACIÓN. Sus cuotas se sumaron a las del contrato anterior y la fecha de alta quedó en la del primero (${alta}). Si en realidad son dos personas distintas con el mismo nombre, hay que distinguirlas en la planilla.`,
        });
      }

      const deudaCruda = leer(f, CLIENTES, 'estadoDeuda');
      const deuda = deudaCruda ? ESTADO_DEUDA[normalizar(deudaCruda)] : undefined;
      if (deudaCruda && !deuda) {
        rc.salteadas.push({ fila: i + 2, motivo: `«${nombre}» tiene un estado de deuda que no reconozco: «${deudaCruda}». El cliente entró; el estado quedó como estaba.` });
      }

      const nombreConsultora = leer(f, CLIENTES, 'consultora');
      const consultoraId = nombreConsultora
        ? consultoraPorNombre.get(normalizar(nombreConsultora))
        : previo?.consultoraId;
      if (nombreConsultora && !consultoraId) {
        rc.salteadas.push({ fila: i + 2, motivo: `Consultora «${nombreConsultora}» no existe en el equipo. El cliente se cargó sin asignar.` });
      }

      const cliente: Cliente = {
        ...previo,
        id,
        nombre,
        email: opcional(leer(f, CLIENTES, 'email')) ?? previo?.email,
        telefono: opcional(leer(f, CLIENTES, 'telefono')) ?? previo?.telefono,
        programa: opcional(leer(f, CLIENTES, 'programa')) ?? previo?.programa ?? 'Founders',
        fechaAlta: alta,
        fechaFinPrevista: fecha(leer(f, CLIENTES, 'fechaFinPrevista')) ?? previo?.fechaFinPrevista,
        planPago: opcional(leer(f, CLIENTES, 'planPago')) ?? previo?.planPago,
        tieneGarantia: booleano(leer(f, CLIENTES, 'tieneGarantia')) || Boolean(previo?.tieneGarantia),
        fuente: opcional(leer(f, CLIENTES, 'fuente')) ?? previo?.fuente,
        consultoraId,
        estado: ESTADO_CLIENTE[normalizar(leer(f, CLIENTES, 'estado'))] ?? previo?.estado ?? 'activo',
        horasRealesSemana: numero(leer(f, CLIENTES, 'horasRealesSemana')) ?? previo?.horasRealesSemana,
        diasGraciaPago: numero(leer(f, CLIENTES, 'diasGraciaPago')) ?? previo?.diasGraciaPago,
        nivelVendido: opcional(leer(f, CLIENTES, 'nivelVendido')) ?? previo?.nivelVendido,

        closer: opcional(leer(f, CLIENTES, 'closer')) ?? previo?.closer,
        setter: opcional(leer(f, CLIENTES, 'setter')) ?? previo?.setter,
        // Vacío es "al día", que es el caso de casi toda la cartera: nadie
        // escribe el estado normal. Un valor que no reconocemos no se inventa.
        estadoDeuda: deuda ?? previo?.estadoDeuda ?? 'al_dia',
        notas: opcional(leer(f, CLIENTES, 'notas')) ?? previo?.notas,

        // En una renovación los importes se acumulan: lo contratado es la suma
        // de los contratos, igual que las cuotas de abajo.
        montoTotal: esRenovacion
          ? (previo?.montoTotal ?? 0) + (numero(leer(f, CLIENTES, 'montoTotal')) ?? 0)
          : numero(leer(f, CLIENTES, 'montoTotal')) ?? previo?.montoTotal,
        cantidadCuotas: esRenovacion
          ? (previo?.cantidadCuotas ?? 0) + (numero(leer(f, CLIENTES, 'cantidadCuotas')) ?? 0)
          : numero(leer(f, CLIENTES, 'cantidadCuotas')) ?? previo?.cantidadCuotas,
        renovaciones: esRenovacion ? (previo?.renovaciones ?? 0) + 1 : previo?.renovaciones ?? 0,
        ultimaRenovacion: esRenovacion ? (altaFila ?? previo?.ultimaRenovacion) : previo?.ultimaRenovacion,
      };
      await repo.guardarCliente(cliente);
      porNombre.set(normalizar(nombre), cliente);

      // La moneda de las cuotas de abajo. El expediente resuelve la suya
      // adentro, que puede venir de una solapa distinta.
      const moneda = opcional(leer(f, CLIENTES, 'moneda')) ?? MONEDA_POR_DEFECTO;

      await escribirExpediente(f, id, dataset, repo, hoy);

      /**
       * Las cuatro cuotas de finanzas, en formato ancho.
       *
       * En una renovación se numeran a continuación de las del contrato
       * anterior: si el primero tuvo tres, las del segundo son la 4, 5 y 6.
       * Así conviven las dos deudas sin pisarse y el orden sigue siendo el
       * cronológico.
       */
      const desde = cuotasDe.get(id) ?? 0;
      let cuotasDeLaFila = 0;
      for (const [n, def] of CUOTAS.entries()) {
        const monto = numero(campo(f, def.monto));
        const venc = fecha(campo(f, def.fecha));
        const estadoCrudo = normalizar(campo(f, def.estado));
        /**
         * Sin importe y sin fecha no hay cuota, aunque la casilla de estado
         * diga algo. La planilla tiene columnas para cuatro cuotas y las marca
         * todas —las que no existen quedan en FALSE—, así que mirar el estado
         * acá le inventaría a cada cliente de una cuota tres cuotas de cero.
         */
        if (monto === null && !venc) continue;

        const estado = ESTADO_PAGO[estadoCrudo] ?? (venc && venc < hoy ? 'vencido' : 'pendiente');
        const numeroCuota = desde + n + 1;
        cuotasDeLaFila = Math.max(cuotasDeLaFila, n + 1);
        const pago: Pago = {
          id: pagoExistente.get(`${id}#${numeroCuota}`) ?? nuevoId(),
          clienteId: id,
          numeroCuota,
          monto: monto ?? 0,
          moneda,
          fechaVencimiento: venc ?? alta,
          fechaPago: estado === 'pagado' ? venc : undefined,
          estado,
        };
        await repo.guardarPago(pago);
        pagoExistente.set(`${id}#${numeroCuota}`, pago.id);
      }
      cuotasDe.set(id, desde + cuotasDeLaFila);

      rc.aplicadas++;
    }
  } catch (e) {
    rc.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(rc);

  // ------------------------------------------------- 1bis · la solapa «Ficha»
  /**
   * Los 32 campos del expediente, de una tabla.
   *
   * Es el camino para cargar el negocio, la autoridad y la estrategia de la
   * cartera entera sin abrir 194 fichas: se pega una tabla con una fila por
   * cliente y se sincroniza. La fila se identifica por nombre, igual que todo
   * lo demás, y **no se adivina por parecido**: una ficha en el expediente
   * equivocado es peor que una ficha faltante, así que lo que no matchea se
   * informa con su número de fila y su nombre tal como vino.
   *
   * A diferencia de la solapa de finanzas, acá no se crea ningún cliente. Esta
   * solapa completa, no da de alta: un nombre que no existe es casi siempre un
   * error de tipeo, y crear un cliente fantasma por una «í» sin acento es
   * exactamente lo que no queremos.
   */
  if (SOLAPAS.ficha) {
    /**
     * La solapa se busca siempre, pero sólo se reporta si hay algo que decir.
     *
     * Con el nombre por defecto, quien nunca creó la solapa no tiene por qué
     * ver una tarjeta que le avisa de algo que no pidió, en cada corrida. Si
     * en cambio alguien nombró la solapa a mano en el entorno, entonces sí
     * espera un resultado y el silencio sería lo confuso.
     */
    const nombrada = Boolean(process.env.SHEETS_SOLAPA_FICHA);
    const rf: ReporteSolapa = { solapa: SOLAPAS.ficha, leidas: 0, aplicadas: 0, salteadas: [] };
    try {
      const filas = await bajar(SOLAPAS.ficha);
      // Se mira el encabezado, no los valores: una tabla cuya primera fila
      // esté vacía sigue siendo la solapa correcta.
      const encabezados = new Set(Object.keys(filas[0] ?? {}));
      const tieneCampos = CAMPOS_DE_FICHA.some((campo) =>
        CLIENTES[campo].some((alias) => encabezados.has(normalizar(alias))),
      );

      if (!tieneCampos) {
        // Google no da error cuando la solapa no existe: devuelve la primera
        // del archivo. Sin esto, el reporte diría que cargó 160 fichas.
        rf.nota =
          `No hay una solapa «${SOLAPAS.ficha}» con columnas del expediente, así que no se cargó ninguna ficha desde ahí. ` +
          'Si querés cargar el negocio, la autoridad y la estrategia de varios clientes de una vez, creá una solapa con ese nombre exacto: una columna «nombre» y las columnas del expediente que quieras llenar.';
      } else {
        rf.leidas = filas.length;
        for (const [i, f] of filas.entries()) {
          const nombre = leer(f, CLIENTES, 'nombre');
          if (!nombre) {
            rf.salteadas.push({ fila: i + 2, motivo: 'Sin nombre de cliente.' });
            continue;
          }
          const cliente = porNombre.get(normalizar(nombre));
          if (!cliente) {
            rf.salteadas.push({
              fila: i + 2,
              motivo: `«${nombre}» no existe en la cartera con ese nombre exacto. Esta solapa completa fichas, no da de alta clientes: revisá el nombre —acentos incluidos— o cargá al cliente primero.`,
            });
            continue;
          }
          await escribirExpediente(f, cliente.id, dataset, repo, hoy);
          rf.aplicadas++;
        }
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'Error desconocido.';
      // Que la solapa no exista no es un fallo: es el caso normal hasta que
      // alguien la crea. Lo demás —la planilla sin compartir, un 500 de
      // Google— sí lo es.
      if (/No existe la solapa/i.test(mensaje)) rf.nota = mensaje;
      else rf.error = mensaje;
    }
    if (nombrada || rf.aplicadas || rf.salteadas.length || rf.error) solapas.push(rf);
  }

  // --------------------------------------------------------------- 2 · pagos
  if (!SOLAPAS.pagos) {
    solapas.push(solapaAusente(SOLAPAS.pagos, 'pagos'));
  } else {
  const rp: ReporteSolapa = { solapa: SOLAPAS.pagos, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.pagos);
    rp.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, PAGOS, 'cliente');
      const c = porNombre.get(normalizar(nombre));
      if (!c) { rp.salteadas.push({ fila: i + 2, motivo: `Cliente «${nombre || '(vacío)'}» no identificable.` }); continue; }
      const cuota = numero(leer(f, PAGOS, 'numeroCuota'));
      const venc = fecha(leer(f, PAGOS, 'fechaVencimiento'));
      if (cuota === null || !venc) { rp.salteadas.push({ fila: i + 2, motivo: `Falta cuota o vencimiento para «${nombre}».` }); continue; }

      const pagado = fecha(leer(f, PAGOS, 'fechaPago'));
      const p: Pago = {
        id: pagoExistente.get(`${c.id}#${cuota}`) ?? nuevoId(),
        clienteId: c.id,
        numeroCuota: cuota,
        monto: numero(leer(f, PAGOS, 'monto')) ?? 0,
        moneda: opcional(leer(f, PAGOS, 'moneda')) ?? MONEDA_POR_DEFECTO,
        fechaVencimiento: venc,
        fechaPago: pagado,
        estado: ESTADO_PAGO[normalizar(leer(f, PAGOS, 'estado'))] ?? (pagado ? 'pagado' : venc < hoy ? 'vencido' : 'pendiente'),
      };
      await repo.guardarPago(p);
      rp.aplicadas++;
    }
  } catch (e) {
    rp.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(rp);
  }

  // --------------------------------------------------------- 3 · asistencias
  if (!SOLAPAS.asistencias) {
    solapas.push(solapaAusente(SOLAPAS.asistencias, 'asistencias'));
  } else {
  const ra: ReporteSolapa = { solapa: SOLAPAS.asistencias, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.asistencias);
    ra.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, ASISTENCIAS, 'cliente');
      const c = porNombre.get(normalizar(nombre));
      if (!c) { ra.salteadas.push({ fila: i + 2, motivo: `Cliente «${nombre || '(vacío)'}» no identificable.` }); continue; }
      const f2 = fecha(leer(f, ASISTENCIAS, 'fecha'));
      const mentoriaCruda = normalizar(leer(f, ASISTENCIAS, 'mentoria'));
      const mentoria = MENTORIAS.find((m) => mentoriaCruda.includes(m));
      if (!f2 || !mentoria) {
        ra.salteadas.push({ fila: i + 2, motivo: `Fecha o mentoría ilegible para «${nombre}». Mentorías válidas: ${MENTORIAS.join(', ')}.` });
        continue;
      }
      const a: AsistenciaMentoria = {
        id: nuevoId(),
        clienteId: c.id,
        mentoria: mentoria as Mentoria,
        fecha: f2,
        asistio: booleano(leer(f, ASISTENCIAS, 'asistio')),
      };
      await repo.guardarAsistencia(a);
      ra.aplicadas++;
    }
  } catch (e) {
    ra.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(ra);
  }

  return { at: hoy, solapas };
}
