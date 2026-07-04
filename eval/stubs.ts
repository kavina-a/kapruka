/** Mock Kapruka tool responses for offline prompt evaluation. */

export function stubToolResponse(
  toolName: string,
  input: Record<string, unknown>,
): unknown {
  switch (toolName) {
    case "searchGifts": {
      const occasionId = input.occasionId?.toString().toLowerCase() ?? "";
      const query = input.query?.toString().toLowerCase() ?? "";
      const isLindt = query.includes("lindt") || query.includes("90%");
      const isSympathy = occasionId === "sympathy" || query.includes("condolen") || query.includes("sympathy");

      const sympathyResults = [
        { productId: "sym00ka001001", name: "White Lily Condolence Bouquet", price: 4800, currency: "LKR", inStock: true, imageUrl: "https://example.com/s1.jpg" },
        { productId: "sym00ka001002", name: "Peace Lily Arrangement", price: 3900, currency: "LKR", inStock: true, imageUrl: "https://example.com/s2.jpg" },
        { productId: "sym00ka001003", name: "Sympathy Floral Hamper", price: 6200, currency: "LKR", inStock: true, imageUrl: "https://example.com/s3.jpg" },
      ];

      const generalResults = [
        { productId: "flower00ka001234", name: "Blushing 7 Pink Roses Bouquet", price: 6520, currency: "LKR", inStock: true, imageUrl: "https://example.com/p1.jpg" },
        { productId: "choc00ka000567", name: "KitKat Silk Roses Bouquet", price: 5900, currency: "LKR", inStock: true, imageUrl: "https://example.com/p2.jpg" },
        { productId: "choc00ka000890", name: "Milk Chocolate Bliss Box", price: 1450, currency: "LKR", inStock: true, imageUrl: "https://example.com/p3.jpg" },
      ];

      return {
        ok: true,
        results: isSympathy ? sympathyResults : generalResults,
        matchQuality: isLindt ? "none" : "exact",
        shopperNote: input.shopperNote ?? "",
        source: "seed",
      };
    }

    case "addToCart":
      return {
        ok: true,
        product: {
          id: (input.productId as string) ?? "flower00ka001234",
          name: (input.productName as string) ?? "Blushing 7 Pink Roses Bouquet",
          price: { amount: 6520, currency: "LKR" },
        },
        quantity: input.quantity ?? 1,
        name: (input.productName as string) ?? "Blushing 7 Pink Roses Bouquet",
      };

    case "removeFromCart":
      return { ok: true, productId: input.productId, name: "Pink Roses Bouquet" };

    case "checkDelivery":
      return {
        ok: true,
        available: true,
        fee: 350,
        sameDayAvailable: true,
        cutoffTime: "14:00",
        perishable: false,
        city: input.city,
      };

    case "findDeliveryCities":
      return {
        ok: true,
        found: true,
        city: input.query,
        confirmed: true,
        cities: [{ name: input.query, slug: String(input.query).toLowerCase() }],
      };

    case "trackOrder":
      return {
        ok: true,
        orderNumber: input.orderNumber,
        status: "Out for delivery",
        estimatedDelivery: "Today by 6pm",
        items: [{ name: "Pink Roses Bouquet", qty: 1 }],
        note: "Damage report can be escalated via kapruka.com/contactUs",
      };

    case "showCheckoutForm":
      return { ok: true, rendered: true, step: input.step ?? "confirm" };

    case "updateCheckoutDetails":
      return { ok: true, updated: true, fields: input };

    case "suggestGiftMessage":
      return {
        ok: true,
        message: "Thinking of you on this special day — with all my love.",
        charCount: 52,
      };

    case "optimizeBudget":
      return {
        ok: true,
        strategy: "single_standout",
        recommendation: "Milk Chocolate Bliss Box",
        maxSpend: input.budget,
      };

    case "updateBuyerProfile":
      return { ok: true, saved: true };

    case "rememberRecipientDislike":
      return { ok: true, saved: true };

    case "listOccasions":
      return {
        ok: true,
        occasions: [
          "birthday",
          "anniversary",
          "romance",
          "mother",
          "flowers",
          "cakes",
          "chocolates",
        ],
      };

    case "getGiftDetails":
      return {
        ok: true,
        productId: input.productId,
        name: "Product Details",
        description: "A lovely gift option",
        price: 4500,
        inStock: true,
      };

    case "setPriceAlert":
      return { ok: true, set: true };

    case "showGiftFinder":
      return { ok: true };

    default:
      return { ok: true, result: "ok" };
  }
}
