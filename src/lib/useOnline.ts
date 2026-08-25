import { useEffect, useState } from 'react'

/**
 * Si el navegador creu que hi ha xarxa.
 *
 * `navigator.onLine` sol i prou no serveix: és un valor que canvia sense
 * avisar React, així que s'ha de llegir un cop i després escoltar els dos
 * esdeveniments. Ho necessiten el rètol de fitxatges pendents i el senyal de
 * la capçalera, i abans de tenir-ho aquí n'hi havia dues còpies.
 *
 * Menteix en un sentit i no en l'altre: `false` vol dir segur que no, i `true`
 * vol dir que hi ha una interfície aixecada —un portal captiu diu que sí. Per
 * això les cues no se'n refien per decidir si envien; només s'usa per triar
 * quina frase es diu.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => {
      setOnline(true)
    }
    const down = () => {
      setOnline(false)
    }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
