import { useEffect, useState } from 'react';
import './Commentator.css';

export default function Commentator({ isPlaying }) {
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
