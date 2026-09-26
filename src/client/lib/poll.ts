export type Meme = { id: string; name: string; image: string; caption: string; origin: 'tr' | 'global' };
export type Round = { id: number; topic: string; question: string; options: [Meme,Meme,Meme]; votes: [number,number,number] };
export const rounds: Round[] = [
  {
    "id": 1,
    "topic": "ANLAT ANLATABİLİRSEN",
    "question": "Arkadaşına Web3’ü beşinci kez anlatırken…",
    "options": [
      {
        "id": "yilmaz",
        "name": "Yılmaz · Gibi",
        "image": "/memes/tr-yilmaz.png",
        "caption": "Kardeşim, aynı şeyi konuşmuyoruz.",
        "origin": "tr"
      },
      {
        "id": "burhan",
        "name": "Burhan Altıntop",
        "image": "/memes/tr-burhan.png",
        "caption": "Ay, bayılacağım artık.",
        "origin": "tr"
      },
      {
        "id": "simply",
        "name": "One Does Not Simply",
        "image": "/memes/61579.jpg",
        "caption": "Öyle iki cümlede anlatılmıyor.",
        "origin": "global"
      }
    ],
    "votes": [
      68,
      42,
      31
    ]
  },
  {
    "id": 2,
    "topic": "UZUN VADECİYİZ",
    "question": "Piyasa düşerken “zaten satmayacaktım” diyen sen…",
    "options": [
      {
        "id": "erdal",
        "name": "Erdal Bakkal",
        "image": "/memes/tr-erdal.png",
        "caption": "Ben burada para kaybediyorum.",
        "origin": "tr"
      },
      {
        "id": "sener",
        "name": "Şener Şen",
        "image": "/memes/tr-sener.jpg",
        "caption": "Hesapta ufak bir yanlışlık var.",
        "origin": "tr"
      },
      {
        "id": "disaster",
        "name": "Disaster Girl",
        "image": "/memes/97984.jpg",
        "caption": "Her şey kontrol altında.",
        "origin": "global"
      }
    ],
    "votes": [
      56,
      38,
      27
    ]
  },
  {
    "id": 3,
    "topic": "MONAD HIZI",
    "question": "Monad işlemin, gözünü kırpmadan onaylanınca…",
    "options": [
      {
        "id": "yusuf",
        "name": "Yusuf Dikeç",
        "image": "/memes/tr-yusuf.png",
        "caption": "Hiç zorlanmadım bile.",
        "origin": "tr"
      },
      {
        "id": "nusret",
        "name": "Salt Bae · Nusret",
        "image": "/memes/tr-nusret.png",
        "caption": "Son dokunuşu da yaptık.",
        "origin": "tr"
      },
      {
        "id": "doge",
        "name": "Doge vs. Cheems",
        "image": "/memes/247375501.png",
        "caption": "Beklemek mi? O da ne?",
        "origin": "global"
      }
    ],
    "votes": [
      61,
      29,
      45
    ]
  },
  {
    "id": 4,
    "topic": "AIRDROP NÖBETİ",
    "question": "Airdrop açıklanacak diye sabahtan beri sayfayı yenilerken…",
    "options": [
      {
        "id": "ismail",
        "name": "İsmail Abi",
        "image": "/memes/tr-ismail.png",
        "caption": "O gemi bir gün gelecek.",
        "origin": "tr"
      },
      {
        "id": "recep",
        "name": "Recep İvedik",
        "image": "/memes/tr-recep.png",
        "caption": "Sabır taşı olsa çatlamıştı.",
        "origin": "tr"
      },
      {
        "id": "buttons",
        "name": "Two Buttons",
        "image": "/memes/87743020.jpg",
        "caption": "Yenile mi, bir daha yenile mi?",
        "origin": "global"
      }
    ],
    "votes": [
      48,
      48,
      33
    ]
  },
  {
    "id": 5,
    "topic": "BİR KÜÇÜK PANİK",
    "question": "Coin’i yanlış ağa gönderdiğini fark ettiğin o an…",
    "options": [
      {
        "id": "behzat",
        "name": "Behzat Ç.",
        "image": "/memes/tr-behzat.png",
        "caption": "Şoku atlatma yöntemim.",
        "origin": "tr"
      },
      {
        "id": "memati",
        "name": "Memati Baş",
        "image": "/memes/tr-memati.png",
        "caption": "Bu işte bir terslik var.",
        "origin": "tr"
      },
      {
        "id": "cat",
        "name": "Woman Yelling at Cat",
        "image": "/memes/188390779.jpg",
        "caption": "Ben o ağı seçmedim ki!",
        "origin": "global"
      }
    ],
    "votes": [
      45,
      62,
      31
    ]
  },
  {
    "id": 6,
    "topic": "KESİN BİLGİ Mİ?",
    "question": "Gruptaki arkadaş “bu coin kesin 100x” deyince…",
    "options": [
      {
        "id": "ramiz",
        "name": "Ramiz Dayı",
        "image": "/memes/tr-ramiz.png",
        "caption": "Her söze güvenilmez, yeğen.",
        "origin": "tr"
      },
      {
        "id": "polat",
        "name": "Polat Alemdar",
        "image": "/memes/tr-polat.png",
        "caption": "Önce bir araştıralım.",
        "origin": "tr"
      },
      {
        "id": "mind",
        "name": "Change My Mind",
        "image": "/memes/129242436.jpg",
        "caption": "Kaynağını göster, fikrim değişsin.",
        "origin": "global"
      }
    ],
    "votes": [
      59,
      37,
      43
    ]
  },
  {
    "id": 7,
    "topic": "SON BİR BAKIŞ",
    "question": "“Son kez grafiğe bakıp yatacağım” deyip saati 04.00 yapınca…",
    "options": [
      {
        "id": "mecnun",
        "name": "Mecnun Çınar",
        "image": "/memes/tr-mecnun.png",
        "caption": "Ben ne ara buraya geldim?",
        "origin": "tr"
      },
      {
        "id": "haluk",
        "name": "Haluk Bilginer",
        "image": "/memes/tr-haluk.png",
        "caption": "Uyku düzeni diye bir şey kalmadı.",
        "origin": "tr"
      },
      {
        "id": "boyfriend",
        "name": "Distracted Boyfriend",
        "image": "/memes/112126428.jpg",
        "caption": "Yatağa giderken bir başka grafik…",
        "origin": "global"
      }
    ],
    "votes": [
      41,
      53,
      36
    ]
  },
  {
    "id": 8,
    "topic": "GAS SÜRPRİZİ",
    "question": "Göndereceğin paradan fazla işlem ücreti görünce…",
    "options": [
      {
        "id": "kemal",
        "name": "Kemal Sunal",
        "image": "/memes/tr-kemal.png",
        "caption": "Bir yanlışlık olmasın bu hesapta?",
        "origin": "tr"
      },
      {
        "id": "aykut",
        "name": "Aykut Elmas",
        "image": "/memes/tr-aykut.png",
        "caption": "Nasipte varsa geri gelir.",
        "origin": "tr"
      },
      {
        "id": "drake",
        "name": "Drake",
        "image": "/memes/181913649.jpg",
        "caption": "Bu ücrete hayır. Monad’a evet.",
        "origin": "global"
      }
    ],
    "votes": [
      57,
      44,
      29
    ]
  },
  {
    "id": 9,
    "topic": "AİLE TOPLANTISI",
    "question": "Aile sofrasında “bu kripto tam olarak ne?” diye sana dönülünce…",
    "options": [
      {
        "id": "cem",
        "name": "Cem Yılmaz",
        "image": "/memes/tr-cem.png",
        "caption": "Şimdi nereden başlasam…",
        "origin": "tr"
      },
      {
        "id": "arif",
        "name": "Arif · G.O.R.A.",
        "image": "/memes/tr-arif.png",
        "caption": "Teknolojiyle aram iyidir.",
        "origin": "tr"
      },
      {
        "id": "logar",
        "name": "216 · G.O.R.A.",
        "image": "/memes/tr-logar.png",
        "caption": "Bir soru daha yaklaşıyor.",
        "origin": "tr"
      }
    ],
    "votes": [
      64,
      49,
      36
    ]
  },
  {
    "id": 10,
    "topic": "GRUBUN UZMANI",
    "question": "Dün cüzdan açan arkadaş bugün sana yatırım anlatırken…",
    "options": [
      {
        "id": "ilkkan",
        "name": "İlkkan · Gibi",
        "image": "/memes/tr-ilkkan.png",
        "caption": "Ben olaya başka açıdan bakıyorum.",
        "origin": "tr"
      },
      {
        "id": "ersoy",
        "name": "Ersoy · Gibi",
        "image": "/memes/tr-ersoy.png",
        "caption": "Bize hiçbir şey nasip olmuyor.",
        "origin": "tr"
      },
      {
        "id": "cards",
        "name": "Köksal Baba",
        "image": "/memes/tr-cards.png",
        "caption": "Sabrım buraya kadardı.",
        "origin": "tr"
      }
    ],
    "votes": [
      46,
      46,
      35
    ]
  }
];
export type Phase = 'voting'|'counting'|'result'|'complete';
export type PollState = {roundIndex:number;selected:number|null;phase:Phase;seconds:number;votes:number[];history:{roundId:number;selected:number;winners:number[];votes:number[]}[]};
export const initialState: PollState = {roundIndex:0,selected:null,phase:'voting',seconds:0,votes:[...rounds[0].votes],history:[]};
export function getWinners(votes: number[]) {const max=Math.max(...votes);return votes.flatMap((v,i)=>v===max?[i]:[]);}
export function percentages(votes:number[]) {const total=votes.reduce((a,b)=>a+b,0);if(!total)return votes.map(()=>0);const raw=votes.map(v=>v/total*100);const values=raw.map(Math.floor);const order=raw.map((v,i)=>({i,remainder:v-values[i]})).sort((a,b)=>b.remainder-a.remainder);const remaining=100-values.reduce((a,b)=>a+b,0);for(let i=0;i<remaining;i++)values[order[i].i]++;return values;}
export type Action={type:'select';index:number}|{type:'vote'}|{type:'tick'}|{type:'next'}|{type:'restart'};
function next(state:PollState):PollState {if(state.phase!=='result')return state;if(state.roundIndex===rounds.length-1)return {...state,phase:'complete',seconds:0};const index=state.roundIndex+1;return {...state,roundIndex:index,selected:null,phase:'voting',votes:[...rounds[index].votes],seconds:0};}
export function pollReducer(state:PollState,action:Action):PollState {
 switch(action.type){
 case 'select':return state.phase==='voting'&&Number.isInteger(action.index)&&action.index>=0&&action.index<3?{...state,selected:action.index}:state;
 case 'vote':{if(state.phase!=='voting'||state.selected===null)return state;const votes=state.votes.map((v,i)=>v+(i===state.selected?1:0));return {...state,votes,phase:'counting',seconds:4};}
 case 'tick':if(state.phase!=='counting'&&state.phase!=='result')return state;if(state.seconds>1)return {...state,seconds:state.seconds-1};if(state.phase==='counting')return {...state,phase:'result',seconds:10,history:[...state.history,{roundId:rounds[state.roundIndex].id,selected:state.selected!,winners:getWinners(state.votes),votes:[...state.votes]}]};return next(state);
 case 'next':return next(state);
 case 'restart':return {...initialState,votes:[...rounds[0].votes],history:[]};
 }
}
