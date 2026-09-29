import { redirect } from 'next/navigation';

/** The dashboard opens on the Executive Summary. */
export default function Home() {
  redirect('/exec');
}
