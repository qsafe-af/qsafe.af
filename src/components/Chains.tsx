import { useEffect, useState } from 'react';
import Markdown from 'react-markdown'

const Chains = () => {
  const [body, setBody] = useState(undefined);

  useEffect(() => {
    fetch(`/chains.md`)
      .then((response) => response.text())
      .then((content) => setBody(content));
  }, []);
  return (
    <Markdown>{body}</Markdown>
  )
};

export default Chains;
