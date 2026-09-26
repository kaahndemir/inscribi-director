# Sunum akışı ve konuşma metni

Toplam yaklaşık 5,5 dakika. Konuşmacı slaytları anlatır, **Kaan** yayını yönetir. Katılım QR'ı en başta gösterilir; insanlar teknik anlatım sürerken katılır, sahneye geçildiğinde telefonları hazırdır.

## Sunumdan önce (17:45'e kadar)

- **Ekran düzeni:** Tek laptop, genişletilmiş ekran. Projeksiyonda `output/inscribi-sunum.html` tam ekran (**F**). Laptopun kendi ekranında `https://live.inscribi.com/stage` ayrı bir Chrome penceresi olarak açık ve **üstü kapanmamış** durur. Sahne penceresi örtülür ya da sekme arkaya düşerse Chrome zamanlayıcıları yavaşlatır, sunucu 8 saniye sinyal alamayınca yayını kapatır.
- **Giriş:** Aynı Chrome'da önce `https://live.inscribi.com/admin#<ADMIN_TOKEN>` açılır, sonra sahne sayfası yenilenir. Yönetim ekranı Kaan'ın telefonunda ya da ikinci sekmede izlenir.
- **Ses:** Sahne sekmesine sağ tık, "Siteyi sesini kapat". Demo anında açılır.
- **Kontrol:** Bir telefonla QR okutulup "Katıl" denenir. Yönetimde fal bütçesi, kalan yayın hakkı ve operatör MON bakiyesi görülür.
- **Sınır:** Katılım sınırı 50 kişi. 51. kişi "Katılım doldu" görür ve yalnız izler.

## Akış

| Süre | Slayt | Konuşmacı | Kaan |
|---|---|---|---|
| 0:00 | 1 · QR | Açılış metni | Sahne penceresinde **Yayını başlat** |
| 0:30 | 2 · Sorun | | Yönetimde katılım sayısını izler |
| 1:00 | 3 · Neden şimdi | | |
| 1:25 | 4 · Nasıl çalışır | | |
| 1:55 | 5 · Sahne sizde | Canlı turları anlatır | Sahne penceresini projeksiyona taşır, sesi açar |
| ~4:00 | 6 · Para ve cüzdan akışı | Canlı sayıları söyler | **Yayını durdur**, sunum penceresine döner |
| 4:35 | 7 · Neden Monad | | |
| 5:00 | 8 · İş modeli | | |
| 5:25 | 9 · Kapanış | | |

Yayın başlar başlamaz ilk tur kendiliğinden açılır. Anlatım sırasında gelen oylar ısınma turudur; asıl izleme 5. slaytta başlar.

## Metin

**1 · QR (30 sn).** "Merhaba, biz inscribi director. Telefonlarınızı çıkarın: birazdan bu salon bir videoyu yönetecek. Ekrandaki QR'ı okutun ve 'Katıl ve demo MON al'a basın. Cüzdan kurmanız gerekmiyor; tarayıcınızda bir test cüzdanı açılıyor ve Monad testnet'ten birkaç kuruşluk demo MON geliyor. Oylama açılırsa şimdiden seçebilirsiniz."

**2 · Sorun (30 sn).** "Canlı yayınlarda ve etkinliklerde izleyici izliyor ama yönetemiyor. İnsanlar ödemeye hazır: bağış atıyor, hediye gönderiyor. Ama karşılığında ekranda bir isim görüyor, içerik değişmiyor. Anketler sohbet penceresinde kalıyor. Bir salonda yüzlerce kişi aynı ekrana bakıyor, söz hakkı yok."

**3 · Neden şimdi (25 sn).** "Bu yıl iki şey aynı anda mümkün oldu. Gerçek zamanlı video modelleri, H3 Max Director, video akarken yeni komut alıp bir sonraki parçada uyguluyor. Monad da her oyu ayrı bir işlem olarak aynı turda onaylıyor; bugün canlıda katılım işlemi 0,4 saniyede onaylandı. İkisi birlikte, salonun kararını saniyeler içinde zincire ve videoya taşıyor."

**4 · Nasıl çalışır (30 sn).** "Bir meme kart oyunu gibi. Ekranda kripto ve hackathon temalı bir durum çıkıyor, telefonunuzda dört meme. Duruma en uygun olanı seçip onaylıyorsunuz; her oy Monad'da bir işlem, 0,001 MON. Kazanan meme canlı videoda canlanıyor. Başrolde, Türkiye'nin hamam böcekleri."

**5 · Sahne sizde (~2 dk).** Kaan sahneyi açar. Konuşmacı her turda:
- Durumu yüksek sesle okur: "Durum: 'Tavsiye ettiğin memecoin 100x olunca…' Hangi meme?"
- Son saniyeleri sayar: "Son beş saniye!"
- Kazananı anons eder: "Kazanan: 'Çok şükür yarabbi'. Sahnede sayaç var, birkaç saniye sonra geliyor." Banner "Şimdi sahnede" dediğinde salonla birlikte izler.
- İki ya da üç tur, sonra: "Teşekkürler, yayını burada durduruyoruz."

**6 · Para ve cüzdan akışı (35 sn).** "Az önce ne oldu? QR'ı açtığınız anda telefonunuzda bir cüzdan oluştu; anahtarı sizde, bizde değil. Operatör cüzdanımız size bir kez 0,08 demo MON gönderdi. Oy verdiğinizde telefonunuz bir işlem imzaladı: 0,001 MON oy bedeli kontrata gitti, ağ ücretini siz ödediniz. Monad'ın eth_sendRawTransactionSync metodu sayesinde onay tek çağrıda geliyor. Süre dolunca kazanan kontratta yazılı; oy bedelleri kontratın hazinesinde birikiyor, iptal edilen turda herkes parasını geri alıyor. Az önce [N] kişi katıldı." Kaan [N]'i yönetimdeki "Demo bakiye verilen" satırından söyler.

**7 · Neden Monad (25 sn).** "Neden Monad? Hız: oy, 20 saniyelik tur bitmeden onaylanıp sayılıyor. Ucuz: 0,001 MON'luk bir oyun anlamlı olması için ağ ücretinin onu yutmaması gerekiyor. EVM: Solidity, Foundry ve viem ile yazdık. Dürüst olalım: oylama zincirde; komutu videoya taşıyan köprü ve video üretimi zincir dışında. Ve hepsi bugün yazıldı, ilk commit 10:49'da."

**8 · İş modeli (25 sn).** "Kimin için? Twitch, Kick ve YouTube yayıncıları, konser ve festival sahneleri, marka etkinlikleri. Nasıl kazanıyor? Her oy küçük bir ödeme; gelir kontratın hazinesinde toplanıyor, yayıncı ile platform arasında zincirde bölüşülüyor. Örnek hesap: videonun maliyeti dakikada yaklaşık 4,8 dolar; 100 izleyici dakikada yaklaşık 150 oy verir, oy başı 5 sentle 7,5 dolar. İzleyici arttıkça marj büyüyor."

**9 · Kapanış (15 sn).** "inscribi director: izleyici oy verir, yapay zekâ çeker, Monad kaydeder. live.inscribi.com'da deneyebilirsiniz. Teşekkürler."

## Sorun olursa

- **Yayın başlamazsa:** Kaan **Yayını başlat**'a yeniden basar (10 hak var, her deneme bir hak). Bu sırada konuşmacı 4. slaytı anlatmaya devam eder.
- **Sahne koparsa** ("Yayın kapandı"): Açık tur iptal edilir, oy verenler iade alabilir. Kaan yeniden başlatır.
- **Oylar gecikirse:** Telefonlar aynı imzalı işlemi tekrar gönderir, çift ödeme olmaz. Konuşmacı: "Salon Monad'ı zorluyor" deyip akışa devam eder.
- **İnternet giderse:** 5. slayttaki canlı kareyle akışı anlatın, sonra 6. slayta geçin.
- **Yedek:** `output/inscribi-sunum.pdf` internetsiz açılır.
- **"Katılım doldu":** Sınır 50 kişi; kalanlar ekrandan izler.

## Jüri soruları

- **Neden blockchain?** Ücretli oyun kayıtla gelmesi, sonucun herkesçe okunabilmesi ve gelir paylaşımının kontratta olması. Monad'ın hızı olmasa 20 saniyelik turda oyu aynı tur içinde saymak mümkün olmazdı.
- **Köprü merkezi değil mi?** Evet. Sonuç zincirden okunuyor; komutu videoya taşıyan köprü ve video zincir dışında. Seçenekler tur başında zincirde sabitlendiği için sonradan değiştirilemiyor.
- **Gecikme?** Kazanan, sayacı ekranda görünerek birkaç saniye içinde sahnede. Canlı ölçüm: 6 saniyelik parça ayarında 4,2–8,4 sn; şu an kararlılık için 10 saniyelik parça kullanıyoruz.
- **Maliyet?** Liste fiyatıyla dakikada 4,8 USD video; iş modeli slaytındaki hesap.
- **İçerik güvenliği?** İzleyici serbest metin girmiyor; komutlar bizim hazırladığımız desteden geliyor. Konuşma Türkçe, bayrak olarak yalnız Türk bayrağı ve saygıyla.
- **Telifli memeler?** Demo içeriği. Ürün, yayıncının kendi destesiyle çalışıyor.
- **Ölçek?** Bugün 50 kişilik sınırla çalışıyoruz; daha büyük kitle için özel RPC ve katılım sınırını artırmak yeterli.
