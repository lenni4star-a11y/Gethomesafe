import { useState } from 'react';
import { PinPad } from './PinPad';

interface Props {
  title: string;
  text: string;
  check: (pin: string) => Promise<boolean>;
  onSuccess: () => void;
  onClose: () => void;
}

/** PIN abfragen, damit niemand anderes die Begleitung beenden kann */
export function PinDialog({ title, text, check, onSuccess, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  return (
    <PinPad
      title={title}
      text={text}
      error={error}
      onCancel={onClose}
      onSubmit={async (pin) => {
        if (await check(pin)) onSuccess();
        else setError('Die PIN stimmt nicht. Bitte nochmal.');
      }}
    />
  );
}
