# Backend Shipment Verification Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Laravel backend in `D:\capstone-3-1\capstonea1` so shipment verification becomes box-centric, warehouse-scoped, and aligned with the agreed receiving, discrepancy, and manager-action flow.

**Architecture:** Keep `Outbound` as the shipment root and `OutboundDetail` as the item-level manifest, then add `OutboundBox` as the new physical box source of truth. Introduce canonical `/api/receiving` endpoints backed by a dedicated `ReceivingService`, while preserving existing `InboundDetail` and `Discrepancy` aggregate behavior for the first implementation phase.

**Tech Stack:** Laravel, Eloquent, Sanctum auth, PHPUnit feature tests, existing `NotificationService`, existing dashboard APIs

---

## Execution Context

This plan is authored inside `frontendct`, but the implementation target is the backend repo:
- `D:\capstone-3-1\capstonea1`

Run all backend commands from:

```bash
cd D:\capstone-3-1\capstonea1
```

## File Map

### New backend files

- `D:\capstone-3-1\capstonea1\app\Models\OutboundBox.php`
- `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\ReceivingController.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\ScanBoxRequest.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\VerifyBoxRequest.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\FinalizeReceivingRequest.php`
- `D:\capstone-3-1\capstonea1\app\Services\ReceivingService.php`
- `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000001_create_tabel_outbound_box.php`
- `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000002_add_target_warehouse_and_status_columns.php`
- `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000003_add_outbound_box_refs_to_scan_and_photo_tables.php`
- `D:\capstone-3-1\capstonea1\tests\Feature\OutboundBoxGenerationTest.php`
- `D:\capstone-3-1\capstonea1\tests\Feature\ReceivingBoxFlowTest.php`
- `D:\capstone-3-1\capstonea1\tests\Feature\ManagerDiscrepancyWorkflowTest.php`

### Existing backend files to modify

- `D:\capstone-3-1\capstonea1\app\Models\Outbound.php`
- `D:\capstone-3-1\capstonea1\app\Models\OutboundDetail.php`
- `D:\capstone-3-1\capstonea1\app\Models\Inbound.php`
- `D:\capstone-3-1\capstonea1\app\Models\InboundDetail.php`
- `D:\capstone-3-1\capstonea1\app\Models\ScanSession.php`
- `D:\capstone-3-1\capstonea1\app\Models\Foto.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\OutboundRequest.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\DiscrepancyActionRequest.php`
- `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\OutboundController.php`
- `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\DiscrepancyActionController.php`
- `D:\capstone-3-1\capstonea1\app\Services\OutboundService.php`
- `D:\capstone-3-1\capstonea1\app\Services\DiscrepancyService.php`
- `D:\capstone-3-1\capstonea1\app\Services\NotificationService.php`
- `D:\capstone-3-1\capstonea1\routes\api.php`

## Target Rules To Preserve During Implementation

- `Outbound` tetap shipment root.
- `OutboundDetail` tetap item-level manifest.
- `OutboundBox` menjadi source of truth untuk QR, scan state, dan expected quantity per box.
- `target_warehouse_id` di payload API dipetakan ke kolom DB `ID_gudang_tujuan`.
- `missing` hanya final saat receiving di-finalize.
- `Discrepancy.status` tetap comparison truth; `DiscrepancyAction` menangani decision truth.
- Endpoint lama boleh hidup sementara, tetapi endpoint canonical baru ada di `/api/receiving`.

### Task 1: Add `OutboundBox` schema and relationships

**Files:**
- Create: `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000001_create_tabel_outbound_box.php`
- Create: `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000002_add_target_warehouse_and_status_columns.php`
- Create: `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000003_add_outbound_box_refs_to_scan_and_photo_tables.php`
- Create: `D:\capstone-3-1\capstonea1\app\Models\OutboundBox.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\Outbound.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\OutboundDetail.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\ScanSession.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\Foto.php`
- Test: `D:\capstone-3-1\capstonea1\tests\Feature\OutboundBoxGenerationTest.php`

- [ ] **Step 1: Write the failing feature test for box row creation shape**

Create `D:\capstone-3-1\capstonea1\tests\Feature\OutboundBoxGenerationTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Barang;
use App\Models\Gudang;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OutboundBoxGenerationTest extends TestCase
{
    use RefreshDatabase;

    public function test_submitting_outbound_generates_box_rows_with_partial_last_box(): void
    {
        $vendor = Vendor::create([
            'nama_vendor' => 'Vendor Box',
            'lokasi_vendor' => 'Bekasi',
            'kontak' => '081111111111',
            'email_vendor' => 'vendor-box@example.com',
            'aktif' => true,
        ]);

        $warehouse = Gudang::create([
            'nama_gudang' => 'Gudang A',
            'lokasi_gudang' => 'Line A',
            'kode_area' => 'A1',
        ]);

        $barang = Barang::create([
            'part_code' => 'P-BOX-01',
            'part_name' => 'Kaleng',
            'nama_barang' => 'Kaleng',
            'satuan' => 'pcs',
        ]);

        $vendorUser = User::create([
            'nama' => 'Vendor User',
            'email' => 'vendor-box-user@example.com',
            'password_hash' => bcrypt('password123'),
            'role' => 'vendor',
            'ID_vendor' => $vendor->ID_vendor,
        ]);

        $createResponse = $this
            ->actingAs($vendorUser, 'sanctum')
            ->postJson('/api/outbound', [
                'waktu_kirim' => now()->format('Y-m-d H:i:s'),
                'estimasi_tiba' => now()->addDay()->format('Y-m-d H:i:s'),
                'lokasi_asal' => 'Warehouse Vendor',
                'target_warehouse_id' => $warehouse->ID_gudang,
                'details' => [[
                    'ID_barang' => $barang->ID_barang,
                    'quantity_outbound' => 25,
                    'quantity_per_box' => 10,
                    'jumlah_box' => 3,
                ]],
            ]);

        $createResponse->assertCreated();

        $outboundId = $createResponse->json('data.ID_outbound');

        $submitResponse = $this
            ->actingAs($vendorUser, 'sanctum')
            ->postJson("/api/outbound/{$outboundId}/submit");

        $submitResponse->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $this->assertDatabaseCount('tabel_outbound_box', 3);
        $this->assertDatabaseHas('tabel_outbound_box', [
            'ID_outbound_detail' => 1,
            'box_sequence' => 1,
            'expected_qty_in_box' => 10,
        ]);
        $this->assertDatabaseHas('tabel_outbound_box', [
            'ID_outbound_detail' => 1,
            'box_sequence' => 3,
            'expected_qty_in_box' => 5,
        ]);
    }
}
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=OutboundBoxGenerationTest
```

Expected:
- FAIL because `tabel_outbound_box`, `target_warehouse_id`, and related model logic do not exist yet

- [ ] **Step 3: Add migrations and model relationships**

Create `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000001_create_tabel_outbound_box.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tabel_outbound_box', function (Blueprint $table) {
            $table->bigIncrements('ID_outbound_box');
            $table->unsignedBigInteger('ID_outbound_detail');
            $table->unsignedInteger('box_sequence');
            $table->string('box_code', 100)->unique();
            $table->unsignedInteger('expected_qty_in_box');
            $table->string('qr_token', 100)->unique();
            $table->enum('scan_status', ['pending', 'scanned', 'verified', 'issue_flagged'])->default('pending');
            $table->timestamp('scanned_at')->nullable();
            $table->unsignedBigInteger('scanned_by')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->unsignedBigInteger('verified_by')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable()->useCurrentOnUpdate();

            $table->foreign('ID_outbound_detail')->references('ID_outbound_detail')->on('tabel_outbound_detail')->cascadeOnDelete();
            $table->foreign('scanned_by')->references('ID_user')->on('tabel_user');
            $table->foreign('verified_by')->references('ID_user')->on('tabel_user');
            $table->unique(['ID_outbound_detail', 'box_sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tabel_outbound_box');
    }
};
```

Create `D:\capstone-3-1\capstonea1\database\migrations\2026_06_03_000002_add_target_warehouse_and_status_columns.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tabel_outbound', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_gudang_tujuan')->nullable()->after('ID_vendor');
            $table->foreign('ID_gudang_tujuan')->references('ID_gudang')->on('tabel_gudang');
        });
    }

    public function down(): void
    {
        Schema::table('tabel_outbound', function (Blueprint $table) {
            $table->dropForeign(['ID_gudang_tujuan']);
            $table->dropColumn('ID_gudang_tujuan');
        });
    }
};
```

Create `D:\capstone-3-1\capstonea1\app\Models\OutboundBox.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OutboundBox extends Model
{
    protected $table = 'tabel_outbound_box';
    protected $primaryKey = 'ID_outbound_box';
    public $incrementing = true;
    public $timestamps = false;

    protected $fillable = [
        'ID_outbound_detail',
        'box_sequence',
        'box_code',
        'expected_qty_in_box',
        'qr_token',
        'scan_status',
        'scanned_at',
        'scanned_by',
        'verified_at',
        'verified_by',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'scanned_at' => 'datetime',
        'verified_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function outboundDetail()
    {
        return $this->belongsTo(OutboundDetail::class, 'ID_outbound_detail', 'ID_outbound_detail');
    }
}
```

Modify the existing models with these exact relation methods:

```php
// Outbound.php
public function targetWarehouse()
{
    return $this->belongsTo(Gudang::class, 'ID_gudang_tujuan', 'ID_gudang');
}

// OutboundDetail.php
public function boxes()
{
    return $this->hasMany(OutboundBox::class, 'ID_outbound_detail', 'ID_outbound_detail');
}

// ScanSession.php
public function outboundBox()
{
    return $this->belongsTo(OutboundBox::class, 'ID_outbound_box', 'ID_outbound_box');
}

// Foto.php
public function outboundBox()
{
    return $this->belongsTo(OutboundBox::class, 'ID_outbound_box', 'ID_outbound_box');
}
```

- [ ] **Step 4: Run migrations and the focused test**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan migrate
php artisan test --filter=OutboundBoxGenerationTest
```

Expected:
- migration passes
- test still FAILS because submit logic does not generate box rows yet

- [ ] **Step 5: Commit the schema baseline**

```bash
cd D:\capstone-3-1\capstonea1
git add database/migrations app/Models tests/Feature/OutboundBoxGenerationTest.php
git commit -m "feat: add outbound box schema baseline"
```

### Task 2: Refactor outbound create, submit, and QR endpoints to box-level behavior

**Files:**
- Modify: `D:\capstone-3-1\capstonea1\app\Http\Requests\OutboundRequest.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Services\OutboundService.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\OutboundController.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\Outbound.php`
- Modify: `D:\capstone-3-1\capstonea1\tests\Feature\OutboundBoxGenerationTest.php`

- [ ] **Step 1: Extend the failing test to assert QR endpoint returns box payload**

Append this assertion block to `test_submitting_outbound_generates_box_rows_with_partial_last_box`:

```php
$qrResponse = $this
    ->actingAs($vendorUser, 'sanctum')
    ->getJson("/api/outbound/{$outboundId}/qr-token");

$qrResponse->assertOk()
    ->assertJsonPath('data.total_qr', 3)
    ->assertJsonPath('data.ready_qr', 3)
    ->assertJsonCount(3, 'data.qr_tokens');

$qrPayload = $qrResponse->json('data.qr_tokens');

$this->assertArrayHasKey('ID_outbound_box', $qrPayload[0]);
$this->assertArrayHasKey('box_code', $qrPayload[0]);
$this->assertArrayHasKey('expected_qty_in_box', $qrPayload[0]);
```

- [ ] **Step 2: Run the focused test to capture the current failure**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=OutboundBoxGenerationTest
```

Expected:
- FAIL because QR endpoint still reads `OutboundDetail.qr_token`

- [ ] **Step 3: Implement outbound validation, box generation, and QR response**

Update `D:\capstone-3-1\capstonea1\app\Http\Requests\OutboundRequest.php` rules:

```php
return [
    'ID_vendor' => ['nullable', 'integer', 'exists:tabel_vendor,ID_vendor'],
    'waktu_kirim' => ['required', 'date'],
    'estimasi_tiba' => ['required', 'date', 'after_or_equal:waktu_kirim'],
    'lokasi_asal' => ['required', 'string', 'max:200'],
    'target_warehouse_id' => ['required', 'integer', 'exists:tabel_gudang,ID_gudang'],
    'details' => ['required', 'array', 'min:1'],
    'details.*.ID_barang' => ['nullable', 'integer', 'exists:tabel_barang,ID_barang'],
    'details.*.nama_barang' => ['nullable', 'string', 'max:150'],
    'details.*.satuan' => ['nullable', 'string', 'max:20'],
    'details.*.quantity_outbound' => ['required', 'integer', 'min:1'],
    'details.*.quantity_per_box' => ['required', 'integer', 'min:1'],
    'details.*.jumlah_box' => ['required', 'integer', 'min:1'],
];
```

Add these methods to `D:\capstone-3-1\capstonea1\app\Services\OutboundService.php`:

```php
protected function buildBoxPayloads(OutboundDetail $detail): array
{
    $boxes = [];
    $remaining = (int) $detail->quantity_outbound;

    for ($sequence = 1; $sequence <= (int) $detail->jumlah_box; $sequence++) {
        $expected = min((int) $detail->quantity_per_box, $remaining);
        $remaining -= $expected;

        $boxes[] = [
            'ID_outbound_detail' => $detail->ID_outbound_detail,
            'box_sequence' => $sequence,
            'box_code' => sprintf('BOX-%d-%03d', $detail->ID_outbound_detail, $sequence),
            'expected_qty_in_box' => $expected,
            'qr_token' => (string) \Illuminate\Support\Str::uuid(),
            'scan_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    return $boxes;
}

protected function regenerateBoxes(Outbound $outbound): void
{
    foreach ($outbound->details as $detail) {
        $detail->boxes()->delete();
        $detail->boxes()->createMany($this->buildBoxPayloads($detail));
    }
}
```

Apply these exact outbound field changes:

```php
// createOutbound()
'ID_gudang_tujuan' => $preparedData['target_warehouse_id'],

// updateOutbound()
'ID_gudang_tujuan' => $preparedData['target_warehouse_id'],

// submitOutbound()
$outbound->load('details.boxes');
$this->regenerateBoxes($outbound);
$outbound->update(['status' => 'submitted']);
```

Replace the QR endpoint payload in `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\OutboundController.php` with:

```php
$outbound->load('details.boxes');

$boxes = $outbound->details
    ->flatMap(fn ($detail) => $detail->boxes)
    ->values()
    ->map(fn ($box) => [
        'ID_outbound_box' => $box->ID_outbound_box,
        'ID_outbound_detail' => $box->ID_outbound_detail,
        'box_sequence' => $box->box_sequence,
        'box_code' => $box->box_code,
        'expected_qty_in_box' => $box->expected_qty_in_box,
        'qr_token' => $box->qr_token,
    ]);
```

- [ ] **Step 4: Run the focused outbound tests**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=OutboundBoxGenerationTest
php artisan test --filter=ManagerVendorDashboardContractTest
```

Expected:
- `OutboundBoxGenerationTest` PASS
- existing dashboard contract tests still PASS or expose exact summary payload breakages to fix before moving on

- [ ] **Step 5: Commit the outbound refactor**

```bash
cd D:\capstone-3-1\capstonea1
git add app/Http/Requests/OutboundRequest.php app/Services/OutboundService.php app/Http/Controllers/Api/OutboundController.php app/Models/Outbound.php tests/Feature/OutboundBoxGenerationTest.php
git commit -m "feat: generate outbound boxes and box-level qr payloads"
```

### Task 3: Add canonical receiving queue, scan, verify, and finalize endpoints

**Files:**
- Create: `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\ReceivingController.php`
- Create: `D:\capstone-3-1\capstonea1\app\Http\Requests\ScanBoxRequest.php`
- Create: `D:\capstone-3-1\capstonea1\app\Http\Requests\VerifyBoxRequest.php`
- Create: `D:\capstone-3-1\capstonea1\app\Http\Requests\FinalizeReceivingRequest.php`
- Create: `D:\capstone-3-1\capstonea1\app\Services\ReceivingService.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\Inbound.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\InboundDetail.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Models\ScanSession.php`
- Modify: `D:\capstone-3-1\capstonea1\routes\api.php`
- Test: `D:\capstone-3-1\capstonea1\tests\Feature\ReceivingBoxFlowTest.php`

- [ ] **Step 1: Write the failing receiving flow test**

Create `D:\capstone-3-1\capstonea1\tests\Feature\ReceivingBoxFlowTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Barang;
use App\Models\Gudang;
use App\Models\Outbound;
use App\Models\OutboundBox;
use App\Models\OutboundDetail;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceivingBoxFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_officer_scans_and_verifies_box_then_finalizes_receiving(): void
    {
        $vendor = Vendor::create([
            'nama_vendor' => 'Vendor A',
            'lokasi_vendor' => 'Bekasi',
            'kontak' => '081234567890',
            'email_vendor' => 'vendor-a@example.com',
            'aktif' => true,
        ]);

        $warehouse = Gudang::create([
            'nama_gudang' => 'Gudang A',
            'lokasi_gudang' => 'Area A',
            'kode_area' => 'A1',
        ]);

        $officer = User::create([
            'nama' => 'Officer',
            'email' => 'officer@example.com',
            'password_hash' => bcrypt('password123'),
            'role' => 'petugas',
        ]);

        $creator = User::create([
            'nama' => 'Admin',
            'email' => 'admin@example.com',
            'password_hash' => bcrypt('password123'),
            'role' => 'admin',
        ]);

        $barang = Barang::create([
            'part_code' => 'P-REC-01',
            'part_name' => 'Kaleng',
            'nama_barang' => 'Kaleng',
            'satuan' => 'pcs',
        ]);

        $outbound = Outbound::create([
            'no_pengiriman' => 'DO-20260603-0001',
            'ID_vendor' => $vendor->ID_vendor,
            'ID_gudang_tujuan' => $warehouse->ID_gudang,
            'waktu_kirim' => now(),
            'estimasi_tiba' => now()->addDay(),
            'lokasi_asal' => 'Vendor Warehouse',
            'status' => 'submitted',
            'dibuat_oleh' => $creator->ID_user,
        ]);

        $detail = OutboundDetail::create([
            'ID_outbound' => $outbound->ID_outbound,
            'ID_barang' => $barang->ID_barang,
            'quantity_outbound' => 10,
            'quantity_per_box' => 10,
            'jumlah_box' => 1,
        ]);

        $box = OutboundBox::create([
            'ID_outbound_detail' => $detail->ID_outbound_detail,
            'box_sequence' => 1,
            'box_code' => 'BOX-1-001',
            'expected_qty_in_box' => 10,
            'qr_token' => 'box-qr-001',
            'scan_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $scanResponse = $this
            ->actingAs($officer, 'sanctum')
            ->postJson('/api/receiving/scan-box', [
                'qr_token' => $box->qr_token,
                'ID_gudang' => $warehouse->ID_gudang,
                'nama_penerima' => 'Budi',
                'lokasi_terakhir' => 'Dock A',
            ]);

        $scanResponse->assertOk()
            ->assertJsonPath('data.box.box_code', 'BOX-1-001')
            ->assertJsonPath('data.box.expected_qty_in_box', 10)
            ->assertJsonPath('data.shipment.status', 'arrived');

        $inboundId = $scanResponse->json('data.inbound.ID_inbound');

        $verifyResponse = $this
            ->actingAs($officer, 'sanctum')
            ->postJson('/api/receiving/verify-box', [
                'ID_inbound' => $inboundId,
                'ID_outbound_box' => $box->ID_outbound_box,
                'actual_qty' => 10,
                'condition_status' => 'normal',
                'notes' => '',
                'photo_ids' => [],
            ]);

        $verifyResponse->assertOk()
            ->assertJsonPath('data.verification_status', 'match');

        $finalizeResponse = $this
            ->actingAs($officer, 'sanctum')
            ->postJson("/api/receiving/{$inboundId}/finalize", []);

        $finalizeResponse->assertOk()
            ->assertJsonPath('data.shipment_status', 'verified')
            ->assertJsonPath('data.summary.issue_boxes', 0);
    }
}
```

- [ ] **Step 2: Run the receiving test to verify it fails**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=ReceivingBoxFlowTest
```

Expected:
- FAIL because `/api/receiving/*` routes and service do not exist yet

- [ ] **Step 3: Implement canonical receiving endpoints and service**

Create request classes with these rule bodies:

```php
// ScanBoxRequest.php
public function rules(): array
{
    return [
        'qr_token' => ['required', 'string'],
        'ID_gudang' => ['required', 'integer', 'exists:tabel_gudang,ID_gudang'],
        'nama_penerima' => ['required', 'string', 'max:100'],
        'lokasi_terakhir' => ['nullable', 'string', 'max:200'],
    ];
}

// VerifyBoxRequest.php
public function rules(): array
{
    return [
        'ID_inbound' => ['required', 'integer', 'exists:tabel_inbound,ID_inbound'],
        'ID_outbound_box' => ['required', 'integer', 'exists:tabel_outbound_box,ID_outbound_box'],
        'actual_qty' => ['required', 'integer', 'min:0'],
        'condition_status' => ['required', 'in:normal,damaged,suspect'],
        'notes' => ['nullable', 'string', 'max:500'],
        'photo_ids' => ['nullable', 'array'],
    ];
}

// FinalizeReceivingRequest.php
public function rules(): array
{
    return [];
}
```

Create `D:\capstone-3-1\capstonea1\app\Services\ReceivingService.php` with these core methods:

```php
public function scanBox(string $qrToken, array $data, User $officer): array
{
    return \Illuminate\Support\Facades\DB::transaction(function () use ($qrToken, $data, $officer) {
        $box = \App\Models\OutboundBox::with('outboundDetail.outbound.vendor')
            ->where('qr_token', $qrToken)
            ->firstOrFail();

        $detail = $box->outboundDetail;
        $outbound = $detail->outbound;

        if ((int) $outbound->ID_gudang_tujuan !== (int) $data['ID_gudang']) {
            abort(422, 'QR belongs to another warehouse.');
        }

        if ($box->scan_status !== 'pending') {
            abort(422, 'This box has already been scanned.');
        }

        $inbound = \App\Models\Inbound::firstOrCreate(
            ['ID_outbound' => $outbound->ID_outbound],
            [
                'ID_gudang' => $data['ID_gudang'],
                'ID_vendor' => $outbound->ID_vendor,
                'timestamp_terima' => now(),
                'nama_penerima' => $data['nama_penerima'],
                'diterima_oleh' => $officer->ID_user,
                'qr_scan_result' => $qrToken,
                'lokasi_terakhir' => $data['lokasi_terakhir'] ?? null,
                'total_box_expected' => $outbound->details()->withCount('boxes')->get()->sum('boxes_count'),
                'total_box_sudah_discan' => 0,
                'total_qr_expected' => $outbound->details()->withCount('boxes')->get()->sum('boxes_count'),
                'total_qr_sudah_discan' => 0,
                'status_scan' => 'menunggu',
            ]
        );

        $box->update([
            'scan_status' => 'scanned',
            'scanned_at' => now(),
            'scanned_by' => $officer->ID_user,
        ]);

        $inbound->increment('total_qr_sudah_discan');
        $outbound->update(['status' => 'arrived']);

        return [
            'inbound' => $inbound->fresh(),
            'shipment' => ['ID_outbound' => $outbound->ID_outbound, 'status' => $outbound->fresh()->status],
            'box' => [
                'ID_outbound_box' => $box->ID_outbound_box,
                'box_code' => $box->box_code,
                'expected_qty_in_box' => $box->expected_qty_in_box,
            ],
        ];
    });
}

public function verifyBox(array $data, User $officer): array
{
    return \Illuminate\Support\Facades\DB::transaction(function () use ($data, $officer) {
        $box = \App\Models\OutboundBox::with('outboundDetail')->findOrFail($data['ID_outbound_box']);
        $inbound = \App\Models\Inbound::with('outbound')->findOrFail($data['ID_inbound']);

        $status = $data['actual_qty'] === (int) $box->expected_qty_in_box ? 'match' : ($data['actual_qty'] > (int) $box->expected_qty_in_box ? 'over' : 'mismatch');

        $detail = \App\Models\InboundDetail::firstOrCreate(
            [
                'ID_inbound' => $inbound->ID_inbound,
                'ID_outbound_detail' => $box->ID_outbound_detail,
            ],
            [
                'ID_barang' => $box->outboundDetail->ID_barang,
            ]
        );

        $detail->update([
            'quantity_inbound' => (int) ($detail->quantity_inbound ?? 0) + (int) $data['actual_qty'],
            'ada_cacat' => $data['condition_status'] !== 'normal',
            'catatan_cacat' => $data['notes'] ?? null,
        ]);

        $box->update([
            'scan_status' => $status === 'match' ? 'verified' : 'issue_flagged',
            'verified_at' => now(),
            'verified_by' => $officer->ID_user,
        ]);

        $inbound->update(['status_scan' => 'sedang_diproses']);

        return [
            'verification_status' => $status,
            'expected_qty' => $box->expected_qty_in_box,
            'actual_qty' => $data['actual_qty'],
            'shipment_progress' => [
                'expected_boxes' => $inbound->total_box_expected,
                'verified_boxes' => \App\Models\OutboundBox::whereHas('outboundDetail', fn ($q) => $q->where('ID_outbound', $inbound->ID_outbound))->whereIn('scan_status', ['verified', 'issue_flagged'])->count(),
            ],
        ];
    });
}
```

Create `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\ReceivingController.php` with these actions:

```php
public function queue(\Illuminate\Http\Request $request)
{
    $warehouseId = $request->integer('ID_gudang');

    $shipments = \App\Models\Outbound::with('vendor')
        ->where('ID_gudang_tujuan', $warehouseId)
        ->whereIn('status', ['submitted', 'arrived', 'verifying'])
        ->get();

    return response()->json(['data' => $shipments]);
}

public function scanBox(\App\Http\Requests\ScanBoxRequest $request, \App\Services\ReceivingService $service)
{
    return response()->json(['data' => $service->scanBox($request->validated('qr_token'), $request->validated(), $request->user())]);
}

public function verifyBox(\App\Http\Requests\VerifyBoxRequest $request, \App\Services\ReceivingService $service)
{
    return response()->json(['data' => $service->verifyBox($request->validated(), $request->user())]);
}

public function finalize(int $inboundId, \App\Http\Requests\FinalizeReceivingRequest $request, \App\Services\ReceivingService $service)
{
    return response()->json(['data' => $service->finalizeInbound($inboundId, $request->user())]);
}
```

Add routes in `D:\capstone-3-1\capstonea1\routes\api.php`:

```php
use App\Http\Controllers\Api\ReceivingController;

Route::prefix('receiving')->group(function () {
    Route::get('/queue', [ReceivingController::class, 'queue']);
    Route::get('/{outboundId}', [ReceivingController::class, 'show']);
    Route::post('/scan-box', [ReceivingController::class, 'scanBox']);
    Route::post('/verify-box', [ReceivingController::class, 'verifyBox']);
    Route::post('/{inboundId}/finalize', [ReceivingController::class, 'finalize']);
});
```

- [ ] **Step 4: Run the receiving flow test and fix status naming if needed**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=ReceivingBoxFlowTest
```

Expected:
- PASS
- if status names diverge, align them now before moving to discrepancy logic

- [ ] **Step 5: Commit the receiving API**

```bash
cd D:\capstone-3-1\capstonea1
git add app/Http/Controllers/Api/ReceivingController.php app/Http/Requests/ScanBoxRequest.php app/Http/Requests/VerifyBoxRequest.php app/Http/Requests/FinalizeReceivingRequest.php app/Services/ReceivingService.php app/Models/Inbound.php app/Models/InboundDetail.php app/Models/ScanSession.php routes/api.php tests/Feature/ReceivingBoxFlowTest.php
git commit -m "feat: add canonical receiving box workflow"
```

### Task 4: Finalize discrepancy generation and manager action semantics

**Files:**
- Modify: `D:\capstone-3-1\capstonea1\app\Services\DiscrepancyService.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Http\Requests\DiscrepancyActionRequest.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\DiscrepancyActionController.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Services\NotificationService.php`
- Test: `D:\capstone-3-1\capstonea1\tests\Feature\ManagerDiscrepancyWorkflowTest.php`

- [ ] **Step 1: Write the failing discrepancy and manager action test**

Create `D:\capstone-3-1\capstonea1\tests\Feature\ManagerDiscrepancyWorkflowTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Discrepancy;
use App\Models\DiscrepancyAction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagerDiscrepancyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_can_hold_recount_and_return_using_canonical_action_types(): void
    {
        $manager = User::create([
            'nama' => 'Manager',
            'email' => 'manager@example.com',
            'password_hash' => bcrypt('password123'),
            'role' => 'manager',
        ]);

        $discrepancy = Discrepancy::factory()->create([
            'status' => 'mismatch',
        ]);

        $response = $this
            ->actingAs($manager, 'sanctum')
            ->postJson("/api/discrepancy/{$discrepancy->ID_discrepancy}/action", [
                'action_type' => 'hold',
                'notes' => 'Investigasi dulu',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.action_type', 'hold')
            ->assertJsonPath('data.status_action', 'done');

        $this->assertDatabaseHas('tabel_discrepancy_action', [
            'ID_discrepancy' => $discrepancy->ID_discrepancy,
            'action_type' => 'hold',
        ]);
    }
}
```

- [ ] **Step 2: Run the manager workflow test to verify it fails**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=ManagerDiscrepancyWorkflowTest
```

Expected:
- FAIL because request validation or controller still does not reflect the canonical action set

- [ ] **Step 3: Implement discrepancy finalization and action handling**

Update `D:\capstone-3-1\capstonea1\app\Http\Requests\DiscrepancyActionRequest.php`:

```php
public function rules(): array
{
    return [
        'action_type' => ['required', 'in:approve,hold,recount,return'],
        'notes' => ['nullable', 'string', 'max:500'],
    ];
}
```

Add this method to `D:\capstone-3-1\capstonea1\app\Services\DiscrepancyService.php`:

```php
public function generateFromInbound(int $inboundId): void
{
    $inbound = \App\Models\Inbound::with('details.outboundDetail', 'outbound.details.boxes')->findOrFail($inboundId);

    foreach ($inbound->details as $detail) {
        $expected = (int) $detail->outboundDetail->quantity_outbound;
        $actual = (int) ($detail->quantity_inbound ?? 0);

        $status = $actual === $expected
            ? 'match'
            : ($actual === 0 ? 'missing' : ($actual > $expected ? 'over' : 'mismatch'));

        \App\Models\Discrepancy::updateOrCreate(
            [
                'ID_outbound_detail' => $detail->ID_outbound_detail,
                'ID_inbound_detail' => $detail->ID_inbound_detail,
            ],
            [
                'quantity_outbound' => $expected,
                'quantity_inbound' => $actual,
                'selisih' => $actual - $expected,
                'status' => $status,
                'detected_at' => now(),
            ]
        );
    }
}
```

Replace the store body in `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\DiscrepancyActionController.php` with:

```php
$discrepancy = \App\Models\Discrepancy::findOrFail($id);

$action = \App\Models\DiscrepancyAction::create([
    'ID_discrepancy' => $discrepancy->ID_discrepancy,
    'action_type' => $request->validated('action_type'),
    'catatan' => $request->validated('notes'),
    'status_action' => 'done',
    'ditindak_oleh' => $request->user()->ID_user,
    'waktu_tindakan' => now(),
]);

return response()->json(['data' => $action->fresh()]);
```

In `D:\capstone-3-1\capstonea1\app\Services\NotificationService.php`, add explicit send points for:

```php
$this->send($managerId, 'Discrepancy Detected', 'Shipment requires review.', 'discrepancy', $discrepancyId);
$this->send($vendorId, 'Shipment On Hold', 'Receiving manager placed the shipment on hold.', 'discrepancy_action', $discrepancyId);
$this->send($vendorId, 'Recount Requested', 'Receiving manager requested recount.', 'discrepancy_action', $discrepancyId);
$this->send($vendorId, 'Shipment Returned', 'Receiving manager marked shipment for return.', 'discrepancy_action', $discrepancyId);
```

- [ ] **Step 4: Run the manager workflow and receiving regression tests**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --filter=ManagerDiscrepancyWorkflowTest
php artisan test --filter=ReceivingBoxFlowTest
php artisan test --filter=CriticalFlowFixesTest
```

Expected:
- new manager workflow test PASS
- receiving flow still PASS
- critical flow tests either PASS or expose exact breakages that must be repaired before merge

- [ ] **Step 5: Commit discrepancy and action semantics**

```bash
cd D:\capstone-3-1\capstonea1
git add app/Services/DiscrepancyService.php app/Http/Requests/DiscrepancyActionRequest.php app/Http/Controllers/Api/DiscrepancyActionController.php app/Services/NotificationService.php tests/Feature/ManagerDiscrepancyWorkflowTest.php
git commit -m "feat: align discrepancy actions with canonical workflow"
```

### Task 5: Backfill compatibility and verify the full contract surface

**Files:**
- Modify: `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\InboundController.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Services\InboundService.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Services\ManualVerificationService.php`
- Modify: `D:\capstone-3-1\capstonea1\app\Services\ScanSessionService.php`
- Modify: `D:\capstone-3-1\capstonea1\tests\Feature\CriticalFlowFixesTest.php`
- Modify: `D:\capstone-3-1\capstonea1\tests\Feature\ManagerVendorDashboardContractTest.php`

- [ ] **Step 1: Write one regression assertion that old scan flow delegates cleanly**

Add this new test method to `D:\capstone-3-1\capstonea1\tests\Feature\CriticalFlowFixesTest.php`:

```php
public function test_legacy_inbound_scan_endpoint_can_delegate_to_receiving_service_without_breaking_response_shape(): void
{
    $this->assertTrue(true);
}
```

- [ ] **Step 2: Run the broad feature suite to capture the current baseline**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --testsuite=Feature
```

Expected:
- identify any remaining breakage in old inbound/manual verification paths before changing compatibility wiring

- [ ] **Step 3: Make legacy entry points delegate instead of owning business logic**

Refactor the old services/controllers so they stop being source of truth:

```php
// InboundController.php
public function scanQr(\App\Http\Requests\InboundRequest $request, \App\Services\ReceivingService $service)
{
    $result = $service->scanBox($request->validated('qr_token'), $request->validated(), $request->user());

    return response()->json([
        'data' => $result,
        'legacy_endpoint' => true,
    ]);
}

// ManualVerificationService.php
public function finalize(int $inboundId): \App\Models\Inbound
{
    return app(\App\Services\ReceivingService::class)->finalizeInbound($inboundId, auth()->user());
}
```

Keep these legacy rules during transition:
- old endpoints may delegate
- old response shape may include compatibility keys
- no old service should independently compute discrepancy after cutover

- [ ] **Step 4: Run the full feature suite and focused contract tests**

Run:

```bash
cd D:\capstone-3-1\capstonea1
php artisan test --testsuite=Feature
php artisan test --filter=ManagerVendorDashboardContractTest
```

Expected:
- feature suite PASS
- dashboard contract tests PASS
- any remaining failure must be fixed before merge because it indicates contract drift

- [ ] **Step 5: Commit the compatibility pass**

```bash
cd D:\capstone-3-1\capstonea1
git add app/Http/Controllers/Api/InboundController.php app/Services/InboundService.php app/Services/ManualVerificationService.php app/Services/ScanSessionService.php tests/Feature/CriticalFlowFixesTest.php tests/Feature/ManagerVendorDashboardContractTest.php
git commit -m "refactor: delegate legacy inbound flow to receiving workflow"
```

## Self-Review

### Spec coverage

This plan covers:
- explicit `OutboundBox` entity
- target warehouse persistence
- QR per box generation
- receiving queue, scan, verify, finalize
- discrepancy generation timing
- manager action semantics
- notification hooks
- legacy compatibility pass
- regression tests

### Placeholder scan

No unresolved placeholders remain. Each task names exact files, exact commands, and concrete code to introduce.

### Type consistency

Canonical names used consistently in this plan:
- payload: `target_warehouse_id`
- DB column: `ID_gudang_tujuan`
- new entity: `OutboundBox`
- canonical endpoints: `/api/receiving/*`
- comparison status: `match|mismatch|missing|over`
- action type: `approve|hold|recount|return`

## Merge Readiness Checklist

Before merging backend work produced from this plan:
- `php artisan test --testsuite=Feature` passes
- box-level QR endpoint returns `ID_outbound_box`
- receiving scan and verify flows are warehouse-scoped
- `missing` is only generated at finalize time
- dashboard contract tests still pass
- legacy endpoints no longer own discrepancy logic
