# inscribi director sunumu

Hackathon için altı slaytlık, Türkçe sunum. Üçüncü slayttaki QR doğrudan `https://live.inscribi.com` adresine gider.

## Düzenleme

- **PowerPoint / Keynote:** [inscribi-hackathon.pptx](output/inscribi-hackathon.pptx) dosyasını açın. Metinler ve görseller ayrı nesnelerdir, düzenlenebilir. Konuşmacı notları süre önerileri ve kaynak açıklamalarını içerir.
- **Tarayıcı sürümü:** [src/slides.json](src/slides.json) içindeki metin, konum, boyut ve renkleri düzenleyin. Görseller [assets](assets) klasöründedir. Düzen ve gezinme davranışı [build.mjs](build.mjs) içindedir.

HTML sürümünü yeniden oluşturmak için repo kökünden çalıştırın:

```sh
node presentation/build.mjs
```

Harici paket gerektirmez. Çıktı `presentation/output/inscribi-sunum.html` dosyasıdır. Görseller dosyaya gömülüdür, sunum internetsiz açılabilir. Canlı demo bağlantısı ve QR hedefi internet gerektirir.

PowerPoint ve HTML sürümleri bağımsızdır. HTML üretim komutu PowerPoint dosyasını değiştirmez. İki sürümün içeriğini değişikliklerden sonra eşitleyin.

## Sahnede kullanım

`output/inscribi-sunum.html` dosyasını tarayıcıda açın. Ok tuşları, boşluk veya PageUp / PageDown ile slayt değiştirin. Home / End ilk ve son slayta gider. **F** tam ekranı açar. İmleci hareket ettirince alt kontroller ve canlı sahne bağlantısı görünür.

## İçerik kaynakları

Ürün akışı bu reponun README dosyasına dayanır. Görsel ve ölçümler, `monad-hackathon` hazırlık deposundaki `docs/dogrulama/D19/sonuc.md` ve `sahne-simdi-sahnede.png` dosyalarından alınmıştır (26 Eylül 2026). Ölçüm tek oturum ve üç mobil tarayıcı bağlamına aittir, fiziksel telefon testi değildir. Ekip rolleri aynı deponun `docs/BUGUN_URUN_PLANI.md` belgesine dayanır.
