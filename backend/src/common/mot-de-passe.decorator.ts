import { ValidationOptions, registerDecorator } from 'class-validator';
import { MESSAGE_MOT_DE_PASSE, defautsMotDePasse } from './mot-de-passe';

/** Valide un champ de mot de passe selon la politique commune (cf. mot-de-passe.ts). */
export function EstMotDePasseRobuste(options?: ValidationOptions): PropertyDecorator {
  return (cible: object, propriete: string | symbol) =>
    registerDecorator({
      name: 'estMotDePasseRobuste',
      target: cible.constructor,
      propertyName: propriete as string,
      options,
      validator: {
        validate: (valeur: unknown) => typeof valeur === 'string' && defautsMotDePasse(valeur).length === 0,
        defaultMessage: (args) => {
          const defauts = typeof args?.value === 'string' ? defautsMotDePasse(args.value) : [];
          return defauts.length ? `${MESSAGE_MOT_DE_PASSE} (manque : ${defauts.join(', ')})` : MESSAGE_MOT_DE_PASSE;
        },
      },
    });
}
