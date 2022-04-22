import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useCrypto } from '../context/useCrypto';
import { TokenList } from '../components/TokenList';
import { StatusBar } from '../components/StatusBar';
import configSettings from '../config.json';

const Tokens = () => {
   const { connectToBlockchain } = useCrypto();  
   const { account } = useCrypto();
   const { tokens } = useCrypto();
   const { buyToken } = useCrypto();
   
   const [isGameModePopupOpen, setIsGameModePopupOpen] = useState(false);
   const [tokensToRender, setTokensToRender] = useState([]);
   
   useEffect(() => {
      (async () => {   
         setTimeout(() => {
            document.querySelectorAll('.hidden-on-load').forEach(e => { e.classList.add('visible-after-load') });
         }, 1000);

         const isConnected = await connectToBlockchain();    
         
         if (!isConnected) {
            setIsGameModePopupOpen(true);
         }           

         const myTokens = tokens.filter((token) => token.owner == account);
         setTokensToRender(myTokens);
        })();
   }, []);

   return (
      <>
         <Head>
            <title>{configSettings.appName}</title>
            <link rel='icon' href='/favicon.ico'></link>            
         </Head>
         <StatusBar></StatusBar>
         <TokenList account={account} buyToken={buyToken} tokens={tokensToRender} title='My tokens'></TokenList>         
      </>
   )
}

export default Tokens;
