import { Card, Chip, SectionTitle } from '@/components/ui';
import { CRITERIOS, REGLAS } from '@/domain/alertas';
import { HITOS_POR_FASE } from '@/domain/fases';
import { MOTORES } from '@/domain/motores/otros';
import { CONSTITUCION_HASH } from '@/domain/motores/constitucion';
import { SEMAFORO_QUE_SIGNIFICA } from '@/domain/semaforo';
import { UMBRALES } from '@/domain/cuenta-inversa';
import { SEMAFORO } from '@/lib/ui';
import type { Semaforo } from '@/domain/types';

export const metadata = { title: 'Cómo se calcula · Founders Brain' };

const ESTADOS: Semaforo[] = ['verde', 'amarillo', 'rojo', 'negro'];

const PILARES = [
  ['Hitos del programa', '30%', 'Hitos cuya fecha ya venció, con crédito parcial por "en progreso". Un gate vencido tapa el pilar en 45.'],
  ['Motor comercial', '25%', 'DMs, conversaciones, agendas y ventas contra la cuenta inversa del propio cliente, no contra un promedio.'],
  ['Ejecución', '20%', 'Compromisos cumplidos, cadencia de sesiones y —si hay garantía— asistencia a mentorías.'],
  ['Resultado', '15%', 'Primera venta contra el día 60. Cae al acercarse y se desploma pasado el día 90.'],
  ['Relación y criterio', '10%', 'Lectura de la consultora, penalizada por alertas abiertas según su gravedad.'],
];

export default function ModeloPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="mb-2">
        <h1 className="text-[22px] font-semibold tracking-tight">Cómo se calcula todo</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          Nada acá es una caja negra. Un número que no se puede discutir no sirve para tomar
          decisiones, y a las dos semanas nadie lo mira.
        </p>
      </header>

      <Card>
        <SectionTitle hint="La confusión más cara de todo el sistema, y por eso va primero">
          Dos instrumentos, dos preguntas
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--serious)' }}>
            <h3 className="text-[13px] font-semibold">Semáforo</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              ¿Hay algo abierto que alguien tiene que atender? Se deriva de las alertas abiertas: manda
              la peor. Tiene dueño, plazo y se cierra escribiendo qué se hizo.
            </p>
            <p className="mt-1.5 text-[12px] text-ink-3">
              Verde no significa «todo bien»: significa «no hay nada abierto».
            </p>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--accent)' }}>
            <h3 className="text-[13px] font-semibold">Índice de avance</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              ¿Este cliente va camino a vender antes del día 60? Se calcula solo, no consume tokens y
              no mueve el semáforo.
            </p>
            <p className="mt-1.5 text-[12px] text-ink-3">
              Cuando los dos se contradicen, eso mismo es información: índice bajo sin alertas
              significa que falta un dato o falta una regla.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle hint="La regla que ordena el módulo, y la que más incomoda">
          ¿Es el cliente o somos nosotros?
        </SectionTitle>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Cada desvío se atribuye a uno de dos lados, y las dos ramas terminan en acciones opuestas.
          Si es el cliente, la consultora lo confronta con el roadmap que él mismo aceptó. Si somos
          nosotros, confrontarlo es injusto y encima no arregla nada.
        </p>
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--critical)' }}>
          <h3 className="text-[13px] font-semibold">No se puede culpar al cliente mientras haya una falla nuestra sin corregir</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            Si hace 37 días que nadie tuvo una sesión con él, no sabemos si ejecutó: no fuimos a
            preguntar. Si el tracker no se carga hace un mes, «volumen bajo» es una hipótesis sobre un
            dato que no existe. Por eso el motor evalúa primero nuestro lado; sólo con nuestro lado
            limpio el atraso pasa a ser del cliente — y entonces sí, con toda la letra.
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line p-3">
            <h3 className="text-[13px] font-semibold">Señales nuestras</h3>
            <ul className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-ink-2">
              <li>· Cadencia rota o sin sesiones registradas</li>
              <li>· Tracker sin cargar: lo carga la consultora al cerrar</li>
              <li>· Cuenta inversa nunca hecha</li>
              <li>· Sin estrategia cargada pasado el día 30</li>
              <li>· Cambio de consultora sin sesión de transición</li>
              <li>· Alerta roja abierta hace más de una semana</li>
              <li>· Nivel del producto que no corresponde al negocio que trajo</li>
            </ul>
          </div>
          <div className="rounded-lg border border-line p-3">
            <h3 className="text-[13px] font-semibold">Señales del cliente</h3>
            <ul className="mt-1 space-y-0.5 text-[12.5px] leading-relaxed text-ink-2">
              <li>· Compromisos incumplidos, con la cuenta hecha</li>
              <li>· DMs muy por debajo de su propia cuenta inversa</li>
              <li>· Sesiones agendadas que no toma</li>
              <li>· Cero mentorías en tres semanas</li>
              <li>· Cero contenido en las semanas cargadas</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Con un expediente ciego el veredicto es «no se puede atribuir», no «es el cliente». Y el
          motor propone: una persona puede corregirlo, pero tiene que escribir por qué y queda
          firmado.
        </p>
      </Card>

      <Card>
        <SectionTitle hint="Entre «va bien» y «hay una alerta» pasan tres semanas que hoy nadie mira">
          El amarillo de la grilla
        </SectionTitle>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Un hito que se pasó de su día pero sigue dentro del margen de 12 días no abre una alerta:
          se pinta de amarillo. Es el estado que faltaba, y es el momento en que corregir todavía
          sale barato. Los gates tienen la mitad del margen, porque bloquean todo lo que viene
          después. Pasado el margen es naranja; con un gate vencido, tres hitos atrasados o más de 30
          días de atraso, es rojo.
        </p>
      </Card>

      <Card>
        <SectionTitle hint="El carril que no discute el servicio">Cobranza</SectionTitle>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Nada del módulo de cobranza lee el semáforo, el índice ni la atribución. Un cliente en rojo
          y un cliente modelo tienen el mismo vencimiento y el mismo día de corte. Los días de margen
          salen del contrato de cada cliente —los viejos tienen 5, los nuevos 3— y no de una
          constante: aplicar la condición nueva a un contrato viejo es indefendible.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          La única puerta que abre al servicio es una: si el cliente dice que lo que recibió no es lo
          que le vendieron, eso no es una excusa de pago sino un reclamo sobre la llamada de venta, y
          va a otro carril con otro responsable y otro plazo.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          Cada prórroga guarda su resultado. De ahí sale la tasa de recupero, que es lo que evita
          discutir la política caso por caso.
        </p>
      </Card>

      <Card>
        <SectionTitle>Estados del semáforo</SectionTitle>
        <ul className="space-y-2">
          {ESTADOS.map((e) => (
            <li key={e} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2" style={{ background: SEMAFORO[e].soft }}>
              <span className="text-[13px] font-semibold" style={{ color: SEMAFORO[e].ink }}>
                {SEMAFORO[e].icono} {SEMAFORO[e].label}
              </span>
              <span className="text-[12.5px] text-ink-2">{SEMAFORO_QUE_SIGNIFICA[e]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
          El verde no genera texto: sólo color en el tablero. Amarillo, rojo y negro llevan siempre
          semáforo + tres líneas + cita textual con fecha + pedido concreto. Sin cita, una alerta de
          criterio no se emite.
        </p>
      </Card>

      <Card>
        <SectionTitle hint="Cinco pilares. Un pilar que no aplica todavía no cuenta como cero: reparte su peso.">
          Índice de avance
        </SectionTitle>
        <ul className="space-y-2">
          {PILARES.map(([n, p, d]) => (
            <li key={n} className="rounded-lg border border-line px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{n}</span>
                <span className="tnum text-[12px] text-ink-3">peso {p}</span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
          <strong className="font-medium">Confianza del dato.</strong> Si hace más de 21 días que no se
          cargan números o no hay sesión, o el expediente tiene menos de cuatro bloques, el índice se
          marca con confianza media o baja. Un índice bajo por falta de datos y uno bajo por problemas
          reales piden acciones opuestas: uno se arregla cargando datos, el otro llamando al cliente.
        </p>
      </Card>

      <Card>
        <SectionTitle hint="El KPI de cada cliente sale de su propia meta y su propio ticket, nunca de un promedio">
          La cuenta inversa
        </SectionTitle>
        <pre className="overflow-x-auto rounded-lg bg-surface-2/60 p-3 text-[11.5px] leading-relaxed">{`ventas_necesarias      = meta_mensual / ticket
asistencias            = ventas / tasa_cierre
agendas                = asistencias / tasa_asistencia
conversaciones_avanzan = agendas / tasa_agendamiento
dms                    = conversaciones_avanzan / tasa_avance
alcance_semanal        = (dms / 4) / tasa_dm_sobre_alcance`}</pre>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
          Un cliente con el embudo en objetivo necesita alrededor de una cuarta parte del alcance que
          necesita el mismo cliente con el embudo en rojo, para facturar exactamente lo mismo. Ese es
          el argumento que hace que deje de pedir más alcance y se ocupe del seguimiento.
        </p>
        <div className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-2">
          <div>Muestra mínima para concluir sobre un eslabón: <strong>{UMBRALES.muestraMinima}</strong></div>
          <div>Avance de conversación sano: <strong>{Math.round(UMBRALES.avanceConversacion * 100)}%</strong></div>
          <div>Agendamiento sano: <strong>{Math.round(UMBRALES.agendamiento * 100)}%</strong></div>
          <div>Asistencia sana: <strong>{Math.round(UMBRALES.asistencia * 100)}%</strong></div>
          <div>Cierre sano: <strong>{Math.round(UMBRALES.cierre * 100)}%</strong></div>
          <div>Alcance de no seguidores: <strong>{Math.round(UMBRALES.alcanceNoSeguidores * 100)}%</strong></div>
        </div>
      </Card>

      <Card>
        <SectionTitle hint={`${REGLAS.length} reglas duras · sin modelo de lenguaje, corren todas las noches`}>
          Catálogo de reglas duras
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Código</th>
                <th className="py-2 pr-3 font-medium">Regla</th>
                <th className="py-2 pr-3 font-medium">Disparo</th>
                <th className="py-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {REGLAS.map((r) => (
                <tr key={r.codigo} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.codigo}</td>
                  <td className="py-2 pr-3">{r.titulo}</td>
                  <td className="py-2 pr-3 text-ink-2">{r.descripcion}</td>
                  <td className="py-2">
                    <Chip tone={r.origenCatalogo === 'brain' ? 'accent' : 'neutral'}>
                      {r.origenCatalogo === 'brain' ? 'Brain' : 'fusión'}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
          <strong className="font-medium">Criterio para agregar una regla:</strong> si al leerla el
          responsable no sabe qué hacer mañana, está mal escrita y hay que borrarla, no ajustarla.
          Tres alertas accionables valen más que veinte informativas.
        </p>
      </Card>

      <Card>
        <SectionTitle hint={`${CRITERIOS.length} criterios · los emite el modelo desde la transcripción, con cita obligatoria`}>
          Criterios de transcripción
        </SectionTitle>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CRITERIOS.map((c) => (
            <div key={c.codigo} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[12px]">
              <span className="font-medium">{c.codigo}</span>
              <span className="flex-1 text-ink-2">{c.titulo}</span>
              <span aria-hidden>{SEMAFORO[c.estado].icono}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle hint="El módulo mide avance de programa; los hitos miden avance de negocio">
          Hitos y fases
        </SectionTitle>
        <div className="space-y-3">
          {HITOS_POR_FASE.map((f) => (
            <div key={f.key} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-semibold capitalize">{f.nombre}</span>
                <span className="text-[11.5px] text-ink-3">{f.pregunta}</span>
              </div>
              <ul className="mt-1.5 grid gap-1 text-[12px] sm:grid-cols-2">
                {f.hitos.map((h) => (
                  <li key={h.key} className="text-ink-2">
                    · día {h.dia} — {h.label}
                    {h.gate && <span className="ml-1 font-semibold text-ink">[gate]</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle hint={`Constitución del rol · hash ${CONSTITUCION_HASH}`}>
          Motores de criterio
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Motor</th>
                <th className="py-2 pr-3 font-medium">Qué hace</th>
                <th className="py-2 pr-3 font-medium">Modelo</th>
                <th className="py-2 pr-3 font-medium">Versión</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {MOTORES.map((m) => (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{m.nombre}</td>
                  <td className="py-2 pr-3 text-ink-2">{m.proposito}</td>
                  <td className="py-2 pr-3 text-ink-2">{m.modelo}</td>
                  <td className="py-2 pr-3 tnum text-[11px] text-ink-3">{m.version}</td>
                  <td className="py-2">
                    <Chip tone={m.estado === 'listo' ? 'good' : 'warning'}>
                      {m.estado === 'listo' ? 'conectado' : 'sin conectar'}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
          Toda salida de modelo se valida contra su schema antes de mostrarse. Si devuelve dos cuellos
          de botella, se rechaza y se reintenta con el error incluido; máximo tres intentos y después
          falla visible. La disciplina va en el código, no en el prompt.
        </p>
      </Card>
    </div>
  );
}
