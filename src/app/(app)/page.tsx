import { redirect } from 'next/navigation';
import { getUsuario, inicioDe } from '@/server/auth';

export default async function Home() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  redirect(inicioDe(usuario.rol));
}
