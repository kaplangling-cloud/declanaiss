import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Champ de saisie d'un mot de passe, avec bouton d'affichage.
 *
 * Le basculement est purement local : rien n'est transmis, et le mot de passe
 * enregistre reste illisible (il n'est stocke que sous forme d'empreinte
 * argon2). L'interet est de verifier sa frappe, en particulier sur un clavier
 * tactile ou avec un mot de passe provisoire complique.
 *
 * Le composant transmet toutes les proprietes d'un `<input>` : il fonctionne
 * aussi bien controle (`value` / `onChange`) que dans un formulaire lu par
 * `FormData` (`name`).
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function ChampMotDePasse({ className = '', ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const libelle = visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe';

  return (
    <div className="relative">
      {/* pr-11 : la saisie ne passe pas sous le bouton */}
      <input {...props} type={visible ? 'text' : 'password'} className={`input pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Bouton a deux etats : `aria-pressed` l'annonce, le libelle dit l'action a venir.
        aria-pressed={visible}
        aria-label={libelle}
        title={libelle}
        // tabIndex -1 exclurait le bouton du clavier : il reste atteignable.
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
