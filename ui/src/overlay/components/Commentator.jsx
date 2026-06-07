import { useEffect, useState } from 'react';
import { useAudioState } from './AudioWidget';
import './Commentator.css';

export default function Commentator() {
  const isPlaying = useAudioState();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isPlaying);
  }, [isPlaying]);

  return (
    <div className={`commentator ${visible ? 'visible' : ''}`}>
      <img src="/assets/commentator.png" alt="Commentator" />
    </div>
  );
}
