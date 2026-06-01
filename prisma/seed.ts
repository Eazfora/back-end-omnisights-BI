import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai proses seeding database...');

  // 1. Bersihkan data lama agar tidak duplikat
  await prisma.transaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.alert.deleteMany();

  // 2. Buat Data Produk Dummy
  const prodElektronik = await prisma.product.create({
    data: {
      name: 'Kamera Mirrorless',
      sku: 'ELEC-001',
      stock: 45,
      category: 'Elektronik',
      price: 15000000,
    },
  });

  const prodKeras = await prisma.product.create({
    data: {
      name: 'SSD 1TB NVMe',
      sku: 'HARD-002',
      stock: 12,
      category: 'Perangkat Keras',
      price: 1750000,
    },
  });

  // 3. Buat Data Transaksi Dummy (Perbaikan: Ditambahkan 'unitPrice')
  console.log('📦 Menyuntikkan data transaksi...');
  await prisma.transaction.createMany({
    data: [
      {
        invoiceDate: new Date('2026-05-01T10:00:00Z'),
        customerId: '169559',
        quantity: 1,
        unitPrice: 15000000,
        totalSales: 15000000,
        status: 'Completed',
        productId: prodElektronik.id,
      },
      {
        invoiceDate: new Date('2026-05-15T14:30:00Z'),
        customerId: '240117',
        quantity: 2,
        unitPrice: 1750000,
        totalSales: 3500000,
        status: 'Completed',
        productId: prodKeras.id,
      },
      {
        invoiceDate: new Date('2026-04-20T09:15:00Z'),
        customerId: '111142',
        quantity: 1,
        unitPrice: 12000000,
        totalSales: 12000000,
        status: 'Completed',
        productId: prodElektronik.id,
      },
    ],
  });

  // 4. Buat Data Peringatan (Perbaikan: Ditambahkan type, description, dan severity)
  await prisma.alert.create({
    data: {
      title: 'Peringatan Stok Menipis',
      status: 'ACTIVE',
      type: 'INVENTORY_ALERT',
      description:
        'Stok SSD 1TB NVMe saat ini tersisa 12 unit. Segera lakukan restock ulang.',
      severity: 'WARNING',
    },
  });

  console.log('✅ Seeding selesai! Database kini memiliki data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
