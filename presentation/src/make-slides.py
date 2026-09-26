# Builds src/slides.json: 1280x720 slides in Yakup's style (dark, purple accent, positioned text and images).
import json, pathlib

ACCENT, TEXT, MUTED, GOOD = '#B69AF7', '#F3F5FA', '#B2B8C9', '#46D39A'
TOTAL = 9

def t(x, y, w, h, text, size, color=TEXT, bold=False):
    return {'type': 'text', 'x': x, 'y': y, 'w': w, 'h': h, 'size': size, 'color': color, 'bold': bold, 't': text}

def img(x, y, w, h, src, alt):
    return {'type': 'image', 'src': src, 'x': x, 'y': y, 'w': w, 'h': h, 'alt': alt}

def frame(n, eyebrow):
    return [t(64, 53, 1150, 30, eyebrow, 20, ACCENT, True),
            t(64, 662, 450, 25, 'inscribi director', 19, MUTED),
            t(1132, 662, 90, 25, f'{n:02d} / {TOTAL:02d}', 18, MUTED)]

def columns(y, items, x0=64, width=350, gap=51, size_title=34, size_body=24):
    out = []
    for i, (num, title, body) in enumerate(items):
        x = x0 + i * (width + gap)
        out += [t(x, y, width, 52, num, 38, ACCENT, True),
                t(x, y + 62, width, 50, title, size_title, TEXT, True),
                t(x, y + 122, width, 96, body, size_body, MUTED)]
    return out

slides = []

# 1. Kapak ve katılım: QR en başta, katılım sunum boyunca tamamlanır.
slides.append(frame(1, 'MONAD BLITZ İSTANBUL') + [
    t(64, 110, 640, 95, 'inscribi', 84, TEXT, True),
    t(64, 196, 640, 95, 'director', 84, ACCENT, True),
    t(68, 330, 620, 130, 'Birazdan bu salon\nbir videoyu yönetecek', 44, TEXT, True),
    t(68, 480, 620, 90, '1  Kameranla QR kodu okut\n2  “Katıl ve demo MON al”a bas', 27, TEXT),
    t(68, 585, 620, 40, 'Monad testnet · demo MON gerçek para değildir', 20, MUTED),
    img(776, 118, 430, 430, 'assets/qr.png', 'https://live.inscribi.com katılım QR kodu'),
    t(776, 562, 440, 46, 'live.inscribi.com', 34, ACCENT, True),
])

# 2. Sorun
slides.append(frame(2, 'SORUN') + [
    t(64, 117, 1150, 154, 'Canlı yayında izleyici izliyor,\nama yönetemiyor', 60, TEXT, True),
    t(67, 290, 1130, 60, 'İzleyiciler ödemeye hazır; ödedikleri şey yalnızca dikkat.', 29, MUTED),
    *columns(390, [
        ('01', 'Bahşiş', 'Bağış ve hediyeler ekranda bir isim gösterir, içeriği değiştirmez.'),
        ('02', 'Sohbet', 'Anketler sohbet penceresinde kalır, yayına yansımaz.'),
        ('03', 'Salon', 'Etkinlikte yüzlerce kişi aynı ekrana bakar ama söz hakkı yoktur.'),
    ]),
])

# 3. Neden şimdi
slides.append(frame(3, 'NEDEN ŞİMDİ') + [
    t(64, 117, 1150, 154, 'Video artık canlı\nyön değiştirebiliyor', 60, TEXT, True),
    t(64, 320, 540, 50, 'Gerçek zamanlı AI video', 34, ACCENT, True),
    t(64, 372, 540, 110, 'H3 Max Director video akarken yeni komut alır ve bir sonraki parçada uygular. Kazanan seçim saniyeler içinde ekranda.', 26, TEXT),
    t(660, 320, 560, 50, 'Saniyenin altında zincir', 34, ACCENT, True),
    t(660, 372, 560, 110, 'Monad’da her oy ayrı bir işlem ve aynı turda onaylanır. Bugün canlıda katılım işlemi 0,4 sn’de onaylandı.', 26, TEXT),
    t(64, 540, 1150, 60, 'İkisi birlikte: salonun kararı saniyeler içinde zincire yazılıyor ve videoya dönüşüyor.', 29, GOOD, True),
])

# 4. Nasıl çalışır: meme kart oyunu
slides.append(frame(4, 'NASIL ÇALIŞIR') + [
    t(64, 110, 780, 150, 'Meme kart oyunu:\ndurum ekranda, seçim salonda', 44, TEXT, True),
    t(64, 300, 60, 50, '01', 36, ACCENT, True), t(140, 300, 640, 46, 'Durum', 32, TEXT, True),
    t(140, 346, 640, 64, 'Kripto ve hackathon temalı bir durum, desteden dört meme.', 24, MUTED),
    t(64, 420, 60, 50, '02', 36, ACCENT, True), t(140, 420, 640, 46, 'Oy', 32, TEXT, True),
    t(140, 466, 640, 64, 'Telefondan seç, onayla. Her oy Monad’da bir işlem, 0,001 MON.', 24, MUTED),
    t(64, 540, 60, 50, '03', 36, ACCENT, True), t(140, 540, 640, 46, 'Sahne', 32, TEXT, True),
    t(140, 586, 640, 64, 'Kazanan meme canlı videoda canlanır. Başrolde hamam böcekleri.', 24, MUTED),
    img(880, 70, 312, 576, 'assets/telefon-kart.png', 'Telefonda durum ve dört meme'),
])

# 5. Canlı demo: sahneye geçiş
slides.append(frame(5, 'CANLI DEMO') + [
    t(64, 117, 600, 160, 'Sahne sizde', 76, TEXT, True),
    t(68, 280, 560, 150, 'Ekrandaki duruma en uygun meme’i seç.\nKazanan birkaç saniye sonra sahnede.', 29, TEXT),
    t(68, 470, 300, 40, 'Henüz katılmadıysan', 22, MUTED),
    img(68, 510, 130, 130, 'assets/qr.png', 'live.inscribi.com'),
    t(215, 560, 330, 40, 'live.inscribi.com', 26, ACCENT, True),
    img(640, 150, 576, 324, 'assets/sahne-araba.png', 'Canlı yayından: Çimenlere girme'),
    t(642, 488, 574, 32, 'Canlı yayından: “Çimenlere girme” kazandı', 20, MUTED),
])

# 6. Monad'da para ve cüzdan akışı
def flow_row(y, num, title, body):
    return [t(64, y, 56, 44, num, 30, ACCENT, True),
            t(128, y, 300, 44, title, 27, TEXT, True),
            t(430, y - 6, 790, 58, body, 21, MUTED)]

slides.append(frame(6, 'MONAD’DA NE OLUYOR') + [
    t(64, 100, 1150, 70, 'Para ve cüzdan akışı', 52, TEXT, True),
    *flow_row(195, '01', 'Cüzdan', 'QR’ı açan telefonda tarayıcı cüzdanı anında oluşur. Özel anahtar telefonda kalır, sunucu göremez; kurulum ya da uygulama yok.'),
    *flow_row(275, '02', 'Demo MON', 'Operatör cüzdanı her yeni cüzdana bir kez 0,08 MON gönderir: sponsorlu katılım. Kişi başı bir kez, sınırlı sayıda.'),
    *flow_row(355, '03', 'Oy = ödeme', 'Telefon vote(tur, seçim) işlemini imzalar: 0,001 MON oy bedeli kontrata gider, ağ ücretini telefon öder. Monad’ın eth_sendRawTransactionSync metodu makbuzu tek çağrıda döndürür.'),
    *flow_row(435, '04', 'Sonuç', 'Süre dolunca finalize çağrılır, kazanan kontratta yazılı. Köprü kazanan komutu Director’a verir.'),
    *flow_row(515, '05', 'Hazine ve iade', 'Oy bedelleri kontratın hazinesinde birikir; sahibi withdraw ile çeker. İptal edilen turda her oy veren refund ile parasını geri alır.'),
    t(64, 595, 1150, 36, 'StoryVote · Monad testnet · 0x0f99d626d223f6cde1bfaa994293bcbbf9d92c7a', 20, GOOD, True),
])

# 7. Neden Monad
slides.append(frame(7, 'NEDEN MONAD') + [
    t(64, 117, 1150, 100, 'Mikro ödemeli canlı oylama için doğru zincir', 50, TEXT, True),
    *columns(250, [
        ('01', 'Hız', 'Saniyenin altında blok: oy, 20 saniyelik tur bitmeden onaylanır ve sayılır.'),
        ('02', 'Ucuz', '0,001 MON’luk oy anlamlı: ağ ücreti oy bedelini yutmaz.'),
        ('03', 'EVM', 'Solidity, Foundry ve viem ile yazdık; aynı kontrat ve araçlar, daha hızlı zincir.'),
    ], size_body=23),
    t(67, 505, 1130, 45, 'Seçenekler tur başında hash’le zincirde sabitlenir. Oylama zincirde; köprü ve video üretimi zincir dışında.', 23, MUTED),
    t(67, 560, 1130, 45, 'Bugün yazıldı: ilk commit 10:49 · 48 birim, 6 uçtan uca, 27 kontrat testi', 23, GOOD, True),
])

# 8. İş modeli
slides.append(frame(8, 'İŞ MODELİ') + [
    t(64, 117, 1150, 154, 'İzleyici ödeyerek yönetir,\nyayıncı kazanır', 60, TEXT, True),
    t(64, 300, 540, 46, 'Kimler için', 32, ACCENT, True),
    t(64, 352, 540, 200, 'Twitch, Kick ve YouTube yayıncıları\nKonser, stand-up ve festival sahneleri\nMarka lansmanları ve etkinlik ajansları', 25, TEXT),
    t(660, 300, 560, 46, 'Nasıl kazanır', 32, ACCENT, True),
    t(660, 352, 560, 200, 'Her oy küçük bir ödeme. Gelir kontratın hazinesinde toplanır; yayıncı ile platform arasında zincirde bölüşülür.', 25, TEXT),
    t(64, 560, 1150, 70, 'Örnek hesap: video dakikada ~4,8 USD (liste fiyatı). 100 izleyici dakikada ~150 oy × 0,05 USD = 7,5 USD.', 23, MUTED),
])

# 9. Kapanış
slides.append(frame(9, 'INSCRIBI DIRECTOR') + [
    t(64, 116, 1150, 181, 'Bir sonraki sahneyi\nbirlikte seçelim', 74, TEXT, True),
    t(67, 330, 1130, 50, 'Canlı yayınlar ve etkinlikler için izleyicinin yönettiği AI video', 29, MUTED),
    t(65, 405, 1130, 70, 'live.inscribi.com', 52, ACCENT, True),
    t(65, 553, 382, 43, 'Dilanur Nigar Kaymak', 26, TEXT, True), t(65, 602, 382, 35, 'Hikâye ve anlatım', 21, MUTED),
    t(463, 553, 382, 43, 'Yakup Gündüz', 26, TEXT, True), t(463, 602, 382, 35, 'Ürün tasarımı ve uygulama', 21, MUTED),
    t(861, 553, 382, 43, 'Kaan Demir', 26, TEXT, True), t(861, 602, 382, 35, 'Monad ve sunucu entegrasyonu', 21, MUTED),
])

assert len(slides) == TOTAL
out = pathlib.Path(__file__).with_name('slides.json')
out.write_text(json.dumps(slides, ensure_ascii=False, indent=1) + '\n')
print('slides', len(slides))
