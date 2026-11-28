import React from 'react';
import { useParams } from 'react-router-dom';
import { FindById } from '../components/FindById';

/** /f/<id> — the same id the AI files use (/f/<id>.txt), opened for people. Redirects to book#id. */
export default function FindPage() {
  const { id = '' } = useParams();
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-head"><h1>Find a finding</h1></div>
      <FindById key={id} initial={id} />
    </div>
  );
}
