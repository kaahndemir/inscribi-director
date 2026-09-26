# inscribi director

Salondaki izleyiciler telefonlarından Monad testnet üzerinde MON ödeyerek oy verir; kazanan seçenek sahnedeki canlı H3 Max Director videosunun devamını yönlendirir.

Monad Blitz İstanbul v2 (26 Eylül 2026) için hazırlandı. Bu depo yalnız ürün kodunu içerir. Deneyler, doğrulama kanıtları ve denetim raporları ayrı hazırlık deposundadır.

## Nasıl çalışır

```
telefon (/)  ──oy işlemi──▶  sunucu /api/rpc  ──▶  Monad testnet: StoryVote
                                                        │
sahne (/stage) ◀──── tur, oy sayısı, kazanan ───── sunucu (show) ◀── zincir anlık görüntüsü
     │                                                   │
     └── WebRTC ── fal H3 Max Director ◀── prompt ── köprü (kazanan → prompt sürümü)
```

1. Operatör sahne ekranında **Yayını başlat**'a basar. Tek bir ücretli Director oturumu açılır.
2. İlk kare geldiğinde sunucu hikâyenin ilk turunu zincirde açar (`open`). Seçenekler, etiket ve prompt'ların hash'iyle zincirde dondurulur.
3. İzleyiciler QR ile siteye girer, tek dokunuşla demo MON alır ve dört seçenekten birine oy verir. Her oy kontrata 0,001 MON ödeyen bir işlemdir; bir cüzdan her turda bir kez oy verebilir.
4. Süre dolunca sunucu turu sonuçlandırır (`finalize`). Kazananın prompt'u köprüye kaydedilir; sahne sekmesi onu Director'a bir kez gönderir ve sağlayıcının kabulünü geri bildirir.
5. Bir sonraki tur kendiliğinden açılır. Yayın süresi dolunca veya durdurulunca açık tur iptal edilir; oy verenler bedellerini telefondan geri alır.

## Ekranlar

| Adres | Kim | Ne yapar |
|---|---|---|
| `/` | İzleyici | Tarayıcı cüzdanı, demo bakiye, oy, iade |
| `/stage` | Projeksiyon (operatör girişi gerekir) | Video, QR, canlı oy çubukları, kazanan; Director bağlantısını bu sekme taşır |
| `/admin#<ADMIN_TOKEN>` | Operatör | Durum, tur aç/sonuçlandır/iptal, yayını durdur, bekleyen yönlendirmeyi bırak |

Yönetim bağlantısı yalnız bir kez açılır; anahtar HttpOnly çereze çevrilir ve adres çubuğundan silinir. QR'a veya paylaşılan belgelere konmaz.

## Güvenlik ve para kuralları

- **Gizli değerler yalnız sunucuda:** `FAL_KEY`, `OPERATOR_PRIVATE_KEY` ve `ADMIN_TOKEN` ortam değişkenidir; tarayıcıya veya diske yazılmaz.
- **Ücretli oturum sınırı:** `MAX_SESSIONS` bu kurulumun ömrü boyunca açılabilecek Director oturumu sayısıdır (kalıcı sayılır). Her oturumda sağlayıcıya tek `/session` isteği gider ve `MAX_SESSION_SECONDS` sert süre sınırıdır. Sunucu yeniden başlarsa açık oturum kapanır ve kendiliğinden yeniden açılmaz.
- **Sahne kiralaması:** Sahne sekmesi 2 saniyede bir kalp atışı gönderir; 8 saniye gelmezse yayın kapanır ve açık tur iptal edilir.
- **fal proxy:** Yalnız `minimax/h3-max/director` modelinin üç WMA yoluna, yalnız operatör çereziyle ve yalnız canlı oturumda izin verir.
- **Oy güvenliği:** Tarayıcı imzalı işlemi göndermeden önce saklar; yanıt kaybolursa aynı baytları yeniden gönderir, yeni imza atmaz. Oy, makbuzda doğru `Voted` olayı varsa sayılır. Aynı tarayıcının iki sekmesi Web Locks ile aynı anda ödeme yapamaz.
- **RPC aktarıcısı:** Katılımcılar sunucu üzerinden yalnız izinli birkaç yöntemi çağırabilir ve yalnız StoryVote'a işlem gönderebilir.
- **Demo bakiye:** Her adrese bir kez, `DRIP_LIMIT` kişiye kadar. İmzalı aktarım göndermeden önce kaydedilir; tekrar aynı adrese ikinci ödeme yapmaz.
- **Kapanış:** `SIGTERM` (Coolify yeniden dağıtımı) gelince açık tur iptal edilmeye çalışılır.

## Yerelde çalıştırma

Gerekenler: Node 24, Foundry (`forge`, `anvil`) ve uçtan uca test için Google Chrome.

```bash
git clone --recurse-submodules https://github.com/kaahndemir/inscribi-director.git
cd inscribi-director
npm ci
cp .env.example .env   # değerleri doldurun
npm run dev
```

Ücretsiz prova için `.env` içinde `DIRECTOR_MODE=fake` kullanın: video üretilmez, yönlendirmeler sunucu tarafından onaylanır, zincir işlemleri gerçektir.

## Testler

```bash
npm test               # birim testleri: hikâye, köprü, oturum bütçesi, drip, fal proxy, yapılandırma
npm run test:contracts # StoryVote için 27 Foundry testi (fuzz dahil)
npm run test:e2e       # Anvil + Chrome: yönetim, sahne, üç telefon, üç tur, güvenlik retleri, yeniden başlatmada iptal ve iade
```

## Kontrat

`contracts/src/StoryVote.sol`: dört seçenek, seçenek hash'i, son tarih, kesin oy ücreti, adres başına tur başına tek oy, en çok oy kazanır (beraberlikte düşük sıra), sıfır oyda kazanan yok, iptal ve iade, ayrı hazine muhasebesi.

```bash
node --env-file=.env scripts/deploy-contract.mjs   # operatör cüzdanından dağıtır, deployments/<chainId>.json yazar
npm run contract:abi                              # kontrat değişirse sunucunun ABI dosyasını yeniler
```

Dağıtan cüzdan kontratın sahibidir; sunucu aynı `OPERATOR_PRIVATE_KEY` ile çalışmalıdır. Sunucu açılışta bunu kontrol eder.

## Hikâye

Hikâye `src/story/story.json` dosyasıdır: açılış sahnesi, sabit sahne tarifi ve her turda dört seçenek (Türkçe etiket, İngilizce eylem). Sunucu açılışta doğrular. Seçenekler oy başladıktan sonra değiştirilemez; zincirdeki hash farkı gösterir.

Hazırlık denetiminden öğrenilen: model sahnedeki nesnelere (ör. top, kapı) komut olmadan yöneliyor. Seçenekler sahnenin kendiliğinden davet etmediği ve görsel olarak belirgin hareketlerden seçilmeli. Şu anki içerik yer tutucudur.

## Coolify'a kurulum

1. **DNS (Cloudflare):** `live` için A kaydı Coolify sunucusunun IP'sine; proxy kapalı (gri bulut).
2. **Uygulama:** "monad-blitz" projesinde bu depodan Dockerfile tabanlı uygulama; alan adı `https://live.inscribi.com`, port 3000.
3. **Kalıcı disk:** `/data` yoluna bir volume bağlayın. Oturum bütçesi, turlar, drip kayıtları ve operatör girişleri burada tutulur; silinirse bütçe sayacı sıfırlanır.
4. **Ortam değişkenleri:** `.env.example` içindekiler. `OPERATOR_PRIVATE_KEY`, `FAL_KEY` ve `ADMIN_TOKEN` gizli olarak işaretlenir.
5. **Sağlık kontrolü:** `/healthz` süreç çalıştığı sürece 200 döner; zincir anlık kopsa bile konteyner yeniden başlatılmaz.

Canlı gösteri sırasında yeniden dağıtım yapmayın: açık oturum kapanır ve bir yayın hakkı harcanmış olur.

## Gösteri günü akışı

1. `/admin#<ADMIN_TOKEN>` bağlantısını operatör cihazında açın. Operatör cüzdan bakiyesini ve kalan yayın hakkını kontrol edin.
2. Projeksiyon bilgisayarında aynı tarayıcıda `/stage` açın, tam ekran yapın.
3. Telefonlarla QR'dan girilip demo bakiyenin alındığını görün.
4. **Yayını başlat.** Turlar kendiliğinden akar; gerekirse yönetimden tur açılır veya yayın durdurulur.
5. Bir yönlendirme yanıt almazsa yönetimde **Bekleyeni bırak** ile akış sürer.

## Maliyet

fal liste fiyatı: üretilen video saniyesi başına 0,08 USD, oturum başına en az 60 saniye. 75 saniyelik bir oturum liste fiyatıyla yaklaşık 6 USD'dir. Yönetim ekranı liste fiyatı tahminini gösterir; gerçek bedel fal panelindedir. Testnet MON gerçek para değildir.

## Sınırlar

- Tek süreç, tek sunucu. Yatay ölçekleme desteklenmez.
- Hazırlıkta gerçek testnet'te en fazla 30 eşzamanlı istemci ölçüldü. Genel RPC sınırlarına takılmamak için özel bir `RPC_URL` önerilir.
- Director akışı sahne sekmesindedir; o bilgisayarın ağı tek hata noktasıdır.
