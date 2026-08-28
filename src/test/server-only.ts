/**
 * `server-only` existe para que un import accidental desde un componente
 * cliente rompa el build. En los tests corre Node y no hay bundler, así que
 * vitest lo apunta acá: la protección sigue valiendo donde importa.
 */
export {};
