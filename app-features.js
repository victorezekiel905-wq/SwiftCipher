// ==================== 35% LIVE GROWTH ENGINE (app-features.js) ====================
// Requirement: Profit counts up every 60 seconds once Admin approves a plan.
// Calculation: MinuteProfit = (InvestedAmount * 0.35) / 10080
// Syncs to Supabase every 5 minutes.

var _growthEngineInterval = null;
var _growthLastSyncTime = 0;
var _GROWTH_SYNC_MS = 5 * 60 * 1000; // 5 minutes

function tickGrowthEngine() {
    if (!window.APP || !APP.currentUser) return;

    // Support both .investment (new) and ._dbInvestment (legacy)
    var inv = APP.currentUser.investment || APP.currentUser._dbInvestment;
    if (!inv) return;

    var status    = inv.status;
    var amount    = Number(inv.amount    || 0);
    var startTime = Number(inv.startTime || 0);

    // Only run when admin has approved (status === 'active' and startTime is set)
    if (status !== 'active' || amount <= 0 || startTime <= 0) return;
    if (inv.completed) return;

    var TOTAL_MINUTES = 10080; // 7 days × 24 h × 60 min
    var TOTAL_ROI     = 0.35;  // 35%
    var now           = Date.now();
    var elapsedMs     = now - startTime;
    var elapsedMinutes = Math.floor(elapsedMs / 60000);

    var maxProfit  = amount * TOTAL_ROI;
    var newProfit  = Math.min((amount * TOTAL_ROI / TOTAL_MINUTES) * elapsedMinutes, maxProfit);
    newProfit = Math.round(newProfit * 100) / 100;

    var isCompleted = (elapsedMinutes >= TOTAL_MINUTES);
    if (isCompleted) newProfit = maxProfit;

    // ---- Update in-memory immediately (UI sees latest values) ----
    if (APP.currentUser.investment) {
        APP.currentUser.investment.profit    = newProfit;
        APP.currentUser.investment.status    = isCompleted ? 'completed' : 'active';
        APP.currentUser.investment.completed = isCompleted;
    }
    if (APP.currentUser._dbInvestment) {
        APP.currentUser._dbInvestment.profit    = newProfit;
        APP.currentUser._dbInvestment.completed = isCompleted;
    }
    APP.currentUser.investmentWallet = amount + newProfit;

    // ---- Update Dashboard UI text live ----
    var dashEl = document.getElementById('dashInterestAccrued');
    if (dashEl && typeof formatCurrency === 'function') {
        dashEl.textContent = formatCurrency(newProfit);
    }
    // Update wallet page interest earned element
    var walletEl = document.getElementById('walletInterestEarned');
    if (walletEl && typeof formatCurrency === 'function') {
        walletEl.textContent = formatCurrency(newProfit);
    }
    // Update available balance element
    var availEl = document.getElementById('walletAvailableBalance');
    if (availEl && typeof formatCurrency === 'function') {
        availEl.textContent = formatCurrency(amount + newProfit);
    }
    // Update status labels
    document.querySelectorAll('.inv-engine-status').forEach(function(el) {
        el.textContent = isCompleted ? '\u2705 Completed' : '\u23f3 In Progress';
        el.style.color = isCompleted ? 'var(--success)' : 'var(--warning)';
    });

    // ---- Sync to Supabase every 5 minutes ----
    var shouldSync = (now - _growthLastSyncTime) >= _GROWTH_SYNC_MS;
    if (shouldSync && window.sbUpdateUserById && APP.currentUser) {
        _growthLastSyncTime = now;
        var updatedInv = Object.assign({}, inv, {
            profit:    newProfit,
            status:    isCompleted ? 'completed' : 'active',
            completed: isCompleted
        });
        window.sbUpdateUserById(APP.currentUser.id, { investment: updatedInv })
            .then(function(row) {
                if (row && APP.currentUser) {
                    var freshInv = (row.investment) || updatedInv;
                    APP.currentUser._dbInvestment = freshInv;
                    APP.currentUser.investment    = freshInv;
                }
            })
            .catch(function() { /* silent fail - UI already has latest in-memory value */ });
    }

    // Stop engine when plan completes
    if (isCompleted) {
        clearInterval(_growthEngineInterval);
        _growthEngineInterval = null;
    }
}

function startGrowthEngine() {
    if (_growthEngineInterval) return; // already running
    tickGrowthEngine();                // immediate first tick
    _growthEngineInterval = setInterval(tickGrowthEngine, 60000); // every 60 seconds
}

function stopGrowthEngine() {
    clearInterval(_growthEngineInterval);
    _growthEngineInterval = null;
}

// Called after login / page refresh to decide whether to start or stop the engine
window.maybeStartGrowthEngine = function() {
    if (!window.APP || !APP.currentUser) { stopGrowthEngine(); return; }
    var inv       = APP.currentUser.investment || APP.currentUser._dbInvestment;
    var amount    = Number((inv && inv.amount)    || 0);
    var startTime = Number((inv && inv.startTime) || 0);
    var status    = (inv && inv.status) || 'inactive';
    var completed = !!(inv && inv.completed);

    if (amount > 0 && startTime > 0 && status === 'active' && !completed) {
        startGrowthEngine();
    } else {
        stopGrowthEngine();
    }
};
window.startGrowthEngine = startGrowthEngine;
window.stopGrowthEngine  = stopGrowthEngine;
window.tickGrowthEngine  = tickGrowthEngine;

// ==================== END 35% LIVE GROWTH ENGINE ====================

// ==================== TRADING CANDLESTICK FIX (LOGIC ONLY) ====================
// Use ONE interval only. Prevent duplicate intervals. Clear when inactive.
let tradingInterval = null;

function userTradingIsActive() {
    if (!APP || !APP.currentUser) return false;
    const invs = getUserInvestmentsComputed(APP.currentUser.id);
    return invs.some(i => i.status === 'active');
}

function updateChart() {
    // Stop immediately if user no longer active
    if (!userTradingIsActive()) {
        stopTrading();
        return;
    }
    updateTradingChart();
}

function startTrading() {
    // Trading must ONLY start after admin confirmation (i.e., active investment exists)
    if (!userTradingIsActive()) return;
    if (tradingInterval) return;
    tradingInterval = setInterval(updateChart, 2000);
}

function stopTrading() {
    clearInterval(tradingInterval);
    tradingInterval = null;
}

function syncTradingState() {
    // Chart must NOT move when trading is inactive
    if (APP.currentRoute !== '#/trading') {
        stopTrading();
        return;
    }
    if (userTradingIsActive()) startTrading();
    else stopTrading();
}

window.startTrading = startTrading;
window.stopTrading = stopTrading;
window.syncTradingState = syncTradingState;

// TRADING PAGE
function renderTrading() {
    ensureTradingDefaults();
    // Ensure interval state matches investment status
    setTimeout(syncTradingState, 50);
    const user = APP.currentUser;
    const trades = getTrades().filter(t => t.userId === user.id);
    const openTrades = trades.filter(t => t.status === 'open');
    const closedTrades = trades.filter(t => t.status === 'closed');
    
    const totalPL = trades.filter(t => t.status === 'closed').reduce((sum, t) => sum + (t.profit || 0), 0);
    const winRate = closedTrades.length > 0 ? (closedTrades.filter(t => t.profit > 0).length / closedTrades.length * 100).toFixed(1) : 0;
    
    const content = `
        <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 8px;">Trading Simulation</h1>
        <p style="color: var(--text-secondary); font-size: 16px; margin-bottom: 32px;">Practice trading with virtual money - No risk involved</p>
        
        <!-- Trading Stats -->
        <div class="grid-responsive" style="margin-bottom: 32px;">
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Virtual Balance</div>
                <div style="font-size: 28px; font-weight: 800;">${formatCurrency(user.tradingBalance)}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total P&L</div>
                <div style="font-size: 28px; font-weight: 800; color: ${totalPL >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(totalPL)}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Win Rate</div>
                <div style="font-size: 28px; font-weight: 800; color: var(--accent);">${winRate}%</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Trades</div>
                <div style="font-size: 28px; font-weight: 800;">${trades.length}</div>
            </div>
        </div>
        
        <div class="grid-responsive-2">
            <!-- Trading Panel -->
            <div>
                <!-- Pair Selector -->
                <div class="card" style="margin-bottom: 24px;">
                    <div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;" class="hide-scrollbar">
                        ${['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'].map(pair => `
                            <button class="btn ${APP.tradingPair === pair ? 'btn-primary' : 'btn-secondary'}" onclick="selectTradingPair('${pair}')" style="white-space: nowrap;">
                                ${pair}
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Price Display -->
                <div class="card" style="margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                        <div>
                            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 4px;" id="tradingPairName">BTC/USDT</div>
                            <div style="font-size: 32px; font-weight: 800;" id="tradingPrice">${formatCurrency(APP.prices.BTC)}</div>
                        </div>
                        <div class="badge badge-success" id="tradingChange">+2.5%</div>
                    </div>
                    <canvas id="tradingPriceChart" style="height: 200px;"></canvas>
                </div>
                
                <!-- Order Form -->
                <div class="card">
                    <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Place Order</h3>
                    
                    <!-- Buy/Sell Toggle -->
                    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                        <button class="btn ${APP.tradeType === 'buy' ? 'btn-success' : 'btn-secondary'}" onclick="setTradeType('buy')" style="flex: 1;">
                            Buy / Long
                        </button>
                        <button class="btn ${APP.tradeType === 'sell' ? 'btn-danger' : 'btn-secondary'}" onclick="setTradeType('sell')" style="flex: 1;">
                            Sell / Short
                        </button>
                    </div>
                    
                    <!-- Order Type -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Order Type</label>
                        <select class="input" id="orderType">
                            <option value="market">Market Order</option>
                            <option value="limit">Limit Order</option>
                        </select>
                    </div>
                    
                    <!-- Amount -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Amount (USD)</label>
                        <input type="number" class="input" placeholder="Enter amount" id="tradeAmount" oninput="calculateTradeSize()">
                    </div>
                    
                    <!-- Leverage -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Leverage</label>
                        <div style="display: flex; gap: 8px;">
                            ${[1, 2, 5, 10].map(lev => `
                                <button class="btn ${APP.tradeLeverage === lev ? 'btn-primary' : 'btn-secondary'}" onclick="setLeverage(${lev})" style="flex: 1;">
                                    ${lev}x
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Order Summary -->
                    <div style="padding: 16px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 14px; color: var(--text-secondary);">Position Size</span>
                            <span style="font-size: 14px; font-weight: 600;" id="positionSize">0.00</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="font-size: 14px; color: var(--text-secondary);">Cost</span>
                            <span style="font-size: 14px; font-weight: 600;" id="tradeCost">$0.00</span>
                        </div>
                    </div>
                    
                    <button class="btn ${APP.tradeType === 'buy' ? 'btn-success' : 'btn-danger'}" style="width: 100%;" onclick="placeTrade()">
                        ${APP.tradeType === 'buy' ? 'Buy / Long' : 'Sell / Short'}
                    </button>
                </div>
            </div>
            
            <!-- Positions & History -->
            <div>
                <!-- Open Positions -->
                <div class="card" style="margin-bottom: 24px;">
                    <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Open Positions</h3>
                    ${openTrades.length > 0 ? `
                        <div style="overflow-x: auto;">
                            <table style="font-size: 14px;">
                                <thead>
                                    <tr>
                                        <th>Pair</th>
                                        <th>Type</th>
                                        <th>Size</th>
                                        <th>Entry</th>
                                        <th>Current</th>
                                        <th>P&L</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${openTrades.map(trade => {
                                        const crypto = trade.pair.split('/')[0];
                                        const currentPrice = APP.prices[crypto];
                                        const pl = trade.type === 'buy' 
                                            ? (currentPrice - trade.entryPrice) * trade.amount * trade.leverage
                                            : (trade.entryPrice - currentPrice) * trade.amount * trade.leverage;
                                        
                                        return `
                                            <tr>
                                                <td style="font-weight: 600;">${trade.pair}</td>
                                                <td>
                                                    <span class="badge ${trade.type === 'buy' ? 'badge-success' : 'badge-danger'}">
                                                        ${trade.type === 'buy' ? 'Long' : 'Short'}
                                                    </span>
                                                </td>
                                                <td>${formatCrypto(trade.amount, 4)}</td>
                                                <td>${formatCurrency(trade.entryPrice)}</td>
                                                <td data-price="${crypto}">${formatCurrency(currentPrice)}</td>
                                                <td style="font-weight: 700; color: ${pl >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                                    ${pl >= 0 ? '+' : ''}${formatCurrency(pl)}
                                                </td>
                                                <td>
                                                    <button class="btn btn-danger" style="padding: 4px 12px; font-size: 12px;" onclick="closeTrade('${trade.id}')">
                                                        Close
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 32px; color: var(--text-secondary);">
                            <div style="font-size: 36px; margin-bottom: 12px;">📊</div>
                            <div>No open positions</div>
                        </div>
                    `}
                </div>
                
                <!-- Recent Trades -->
                <div class="card">
                    <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Recent Trades</h3>
                    ${closedTrades.length > 0 ? `
                        <div style="overflow-x: auto;">
                            <table style="font-size: 14px;">
                                <thead>
                                    <tr>
                                        <th>Pair</th>
                                        <th>Type</th>
                                        <th>Entry</th>
                                        <th>Exit</th>
                                        <th>P&L</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${closedTrades.slice(0, 10).map(trade => `
                                        <tr>
                                            <td style="font-weight: 600;">${trade.pair}</td>
                                            <td>
                                                <span class="badge ${trade.type === 'buy' ? 'badge-success' : 'badge-danger'}">
                                                    ${trade.type === 'buy' ? 'Long' : 'Short'}
                                                </span>
                                            </td>
                                            <td>${formatCurrency(trade.entryPrice)}</td>
                                            <td>${formatCurrency(trade.exitPrice)}</td>
                                            <td style="font-weight: 700; color: ${trade.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                                ${trade.profit >= 0 ? '+' : ''}${formatCurrency(trade.profit)}
                                            </td>
                                            <td style="color: var(--text-secondary); font-size: 12px;">${formatDate(trade.closedAt)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 32px; color: var(--text-secondary);">
                            <div style="font-size: 36px; margin-bottom: 12px;">📈</div>
                            <div>No closed trades yet</div>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
    
    return renderLayout(content, 'trading');
}

function ensureTradingDefaults() {
    if (!APP) return;
    if (!APP.tradingPair) APP.tradingPair = 'BTC/USDT';
    if (!APP.tradeType) APP.tradeType = 'buy';
    if (!APP.tradeLeverage) APP.tradeLeverage = 1;
}

function selectTradingPair(pair) {
    ensureTradingDefaults();
    APP.tradingPair = pair;
    render();
}

function setTradeType(type) {
    ensureTradingDefaults();
    APP.tradeType = type;
    render();
}

function setLeverage(leverage) {
    ensureTradingDefaults();
    APP.tradeLeverage = leverage;
    calculateTradeSize();
    render();
}

function calculateTradeSize() {
    ensureTradingDefaults();
    const amount = parseFloat($('#tradeAmount')?.value) || 0;
    const crypto = APP.tradingPair.split('/')[0];
    const price = APP.prices[crypto];
    
    if (amount > 0) {
        const size = (amount * APP.tradeLeverage) / price;
        const positionSize = $('#positionSize');
        const tradeCost = $('#tradeCost');
        
        if (positionSize) positionSize.textContent = formatCrypto(size, 6) + ' ' + crypto;
        if (tradeCost) tradeCost.textContent = formatCurrency(amount);
    }
}

function placeTrade() {
    ensureTradingDefaults();
    const amount = parseFloat($('#tradeAmount')?.value) || 0;
    
    if (amount <= 0) {
        showToast('Please enter trade amount', 'error');
        return;
    }

    // Trading is only allowed for users with ACTIVE investments
    const invs = getUserInvestmentsComputed(APP.currentUser.id);
    const hasActiveInvestment = invs.some(i => i.status === 'active');
    if (!hasActiveInvestment) {
        showToast('Trading is only available after your investment is confirmed and active.', 'error');
        setTimeout(() => navigate('#/investments'), 600);
        return;
    }

    // Link trading to investment wallet readings (available balance from investments)
    const invSummary = getWalletInvestmentSummary(APP.currentUser.id);
    const maxAllowed = invSummary.availableBalance;
    if (amount > maxAllowed) {
        showToast('Trade amount exceeds your available investment balance.', 'error');
        return;
    }

    
    if (amount > APP.currentUser.tradingBalance) {
        showToast('Insufficient trading balance', 'error');
        return;
    }
    
    const crypto = APP.tradingPair.split('/')[0];
    const price = APP.prices[crypto];
    const size = (amount * APP.tradeLeverage) / price;
    
    // Deduct from balance (in-memory only)
    APP.currentUser.tradingBalance -= amount;
    
    // Create trade
    const trades = getTrades();
    trades.push({
        id: generateId(),
        userId: APP.currentUser.id,
        pair: APP.tradingPair,
        type: APP.tradeType,
        amount: size,
        entryPrice: price,
        currentPrice: price,
        leverage: APP.tradeLeverage,
        status: 'open',
        openedAt: Date.now()
    });
    saveTrades(trades);
    
    showToast(`${APP.tradeType === 'buy' ? 'Long' : 'Short'} position opened for ${APP.tradingPair}`, 'success');
    setTimeout(() => render(), 500);
}

function closeTrade(tradeId) {
    ensureTradingDefaults();
    const trades = getTrades();
    const tradeIndex = trades.findIndex(t => t.id === tradeId);
    const trade = trades[tradeIndex];
    
    const crypto = trade.pair.split('/')[0];
    const currentPrice = APP.prices[crypto];
    
    const pl = trade.type === 'buy' 
        ? (currentPrice - trade.entryPrice) * trade.amount * trade.leverage
        : (trade.entryPrice - currentPrice) * trade.amount * trade.leverage;
    
    // Update balance (in-memory only)
    const returnAmount = (trade.amount * trade.entryPrice / trade.leverage) + pl;
    APP.currentUser.tradingBalance += returnAmount;
    
    // Update trade
    trades[tradeIndex].status = 'closed';
    trades[tradeIndex].exitPrice = currentPrice;
    trades[tradeIndex].profit = pl;
    trades[tradeIndex].closedAt = Date.now();
    saveTrades(trades);
    
    // Add transaction
    addTransaction({
        type: 'trade',
        pair: trade.pair,
        profit: pl
    });
    
    showToast(`Position closed with ${pl >= 0 ? 'profit' : 'loss'} of ${formatCurrency(Math.abs(pl))}`, pl >= 0 ? 'success' : 'error');
    setTimeout(() => render(), 500);
}

function initTradingCharts() {
    ensureTradingDefaults();

    // Price chart
    const days = [];
    const prices = [];
    const crypto = APP.tradingPair?.split('/')[0] || 'BTC';
    const basePrice = APP.prices[crypto];

    // Keep last price per crypto to prevent constant drift
    if (!APP.tradingLastPrice) APP.tradingLastPrice = {};
    APP.tradingLastPrice[crypto] = basePrice;

    for (let i = 23; i >= 0; i--) {
        days.push(i + 'h');
        prices.push(basePrice * (0.98 + Math.random() * 0.04));
    }

    const ctx = document.getElementById('tradingPriceChart');
    if (ctx) {
        APP.charts.tradingPrice = new Chart(ctx, {
            type: 'line',
            data: {
                labels: days,
                datasets: [{
                    data: prices,
                    borderColor: APP.tradeType === 'buy' ? '#00D4AA' : '#FF4757',
                    backgroundColor: APP.tradeType === 'buy' ? 'rgba(0, 212, 170, 0.1)' : 'rgba(255, 71, 87, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    // Start/stop trading based on ACTIVE status (single interval)
    setTimeout(syncTradingState, 50);
}

// ==================== CHART FREEZE: updateTradingChart is intentionally blank ====================
// Candlesticks are 100% frozen - no movement allowed.
function updateTradingChart() {
    // FROZEN: no chart movement. DO NOT add any logic here.
    return;

    // Dead code below kept only for reference - will never execute:
    ensureTradingDefaults();
    if (!APP.charts.tradingPrice) return;

    const crypto = APP.tradingPair.split('/')[0];

    if (!APP.tradingLastPrice) APP.tradingLastPrice = {};
    const last = APP.tradingLastPrice[crypto] || APP.prices[crypto];
    const base = APP.prices[crypto];

    const volatility = 0.006;
    const shock = (Math.random() - 0.5) * 2 * volatility;
    const meanRevert = (base - last) * 0.02;

    let next = last * (1 + shock) + meanRevert;
    if (!isFinite(next) || next <= 0) next = Math.max(1, base);

    APP.tradingLastPrice[crypto] = next;
    APP.prices[crypto] = next;

    // Update main price text (keeps UI consistent)
    const priceEl = document.getElementById('tradingPrice');
    if (priceEl) priceEl.textContent = formatCurrency(next);

    // Simple change badge
    const chEl = document.getElementById('tradingChange');
    if (chEl) {
        const pct = ((next - last) / last) * 100;
        const up = pct >= 0;
        chEl.className = 'badge ' + (up ? 'badge-success' : 'badge-danger');
        chEl.textContent = (up ? '+' : '') + pct.toFixed(2) + '%';
    }

    APP.charts.tradingPrice.data.datasets[0].data.push(next);
    APP.charts.tradingPrice.data.datasets[0].data.shift();
    APP.charts.tradingPrice.update('none');
}

// REFERRAL PAGE
function renderReferral() {
    const user = APP.currentUser;
    const referrals = getReferrals().filter(r => r.referrerId === user.id);
    
    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter(r => r.status === 'active').length;
    const totalEarned = referrals.reduce((sum, r) => sum + r.commission, 0);
    
    const referralLink = `https://swiftcipher.com/register?ref=${user.referralCode}`;
    
    const content = `
        <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 8px;">Referral Program</h1>
        <p style="color: var(--text-secondary); font-size: 16px; margin-bottom: 32px;">Invite friends and earn commission on their investments</p>
        
        <!-- Referral Link -->
        <div class="card" style="margin-bottom: 32px;">
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Your Referral Link</h3>
            <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                <input type="text" class="input" value="${referralLink}" id="referralLink" readonly style="flex: 1;">
                <button class="btn btn-primary" onclick="copyReferralLink()">
                    📋 Copy
                </button>
            </div>
            
            <!-- Share Buttons -->
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button class="btn btn-success" onclick="shareVia('whatsapp')" style="display: flex; align-items: center; gap: 8px;">
                    <span>📱</span> WhatsApp
                </button>
                <button class="btn btn-primary" onclick="shareVia('telegram')" style="display: flex; align-items: center; gap: 8px;">
                    <span>✈️</span> Telegram
                </button>
                <button class="btn" style="background: #1DA1F2; color: white; display: flex; align-items: center; gap: 8px;" onclick="shareVia('twitter')">
                    <span>🐦</span> Twitter
                </button>
            </div>
        </div>
        
        <!-- Stats -->
        <div class="grid-responsive" style="margin-bottom: 32px;">
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Referrals</div>
                <div style="font-size: 32px; font-weight: 800;">${totalReferrals}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Active Referrals</div>
                <div style="font-size: 32px; font-weight: 800; color: var(--success);">${activeReferrals}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Earned</div>
                <div style="font-size: 32px; font-weight: 800; color: var(--accent);">${formatCurrency(totalEarned)}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Available Balance</div>
                <div style="font-size: 32px; font-weight: 800;">${formatCurrency(user.referralWallet)}</div>
            </div>
        </div>
        
        <!-- Commission Structure -->
        <div class="card" style="margin-bottom: 32px;">
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Commission Structure</h3>
            <div class="grid-responsive-2">
                <div style="padding: 20px; background: linear-gradient(135deg, rgba(0, 212, 170, 0.1) 0%, rgba(0, 212, 170, 0.05) 100%); border-radius: 12px; border: 1px solid rgba(0, 212, 170, 0.2);">
                    <div style="font-size: 36px; margin-bottom: 12px;">👥</div>
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Level 1 Referrals</div>
                    <div style="font-size: 32px; font-weight: 800; color: var(--success); margin-bottom: 8px;">10%</div>
                    <div style="font-size: 14px; color: var(--text-secondary);">Direct referrals</div>
                </div>
                
                <div style="padding: 20px; background: linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(108, 99, 255, 0.05) 100%); border-radius: 12px; border: 1px solid rgba(108, 99, 255, 0.2);">
                    <div style="font-size: 36px; margin-bottom: 12px;">👥👥</div>
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Level 2 Referrals</div>
                    <div style="font-size: 32px; font-weight: 800; color: var(--accent); margin-bottom: 8px;">5%</div>
                    <div style="font-size: 14px; color: var(--text-secondary);">Indirect referrals</div>
                </div>
            </div>
        </div>
        
        <!-- Referral Tree -->
        <div class="card" style="margin-bottom: 32px;">
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Referral Network</h3>
            <div style="padding: 32px; background: var(--bg-secondary); border-radius: 12px; overflow-x: auto;">
                <div style="text-align: center;">
                    <div style="display: inline-block; padding: 16px 24px; background: var(--accent); border-radius: 12px; color: white; font-weight: 700; margin-bottom: 32px;">
                        You (${user.referralCode})
                    </div>
                    
                    ${referrals.filter(r => r.level === 1).length > 0 ? `
                        <div style="display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
                            <div style="width: 2px; height: 32px; background: var(--border);"></div>
                        </div>
                        
                        <div style="display: flex; justify-content: center; gap: 24px; flex-wrap: wrap;">
                            ${referrals.filter(r => r.level === 1).slice(0, 5).map(ref => `
                                <div style="text-align: center;">
                                    <div style="padding: 12px 16px; background: var(--success); border-radius: 8px; color: white; font-size: 14px; font-weight: 600;">
                                        ${ref.referredEmail}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
                                        ${formatCurrency(ref.commission)}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 32px; color: var(--text-secondary);">
                            <div style="font-size: 48px; margin-bottom: 16px;">🌱</div>
                            <div>Start building your referral network</div>
                        </div>
                    `}
                </div>
            </div>
        </div>
        
        <!-- Referral History -->
        <div class="card">
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Referral History</h3>
            ${referrals.length > 0 ? `
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Amount Invested</th>
                                <th>Commission</th>
                                <th>Level</th>
                                <th>Status</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${referrals.map(ref => `
                                <tr>
                                    <td style="font-weight: 600;">${ref.referredEmail}</td>
                                    <td>${formatCurrency(ref.invested)}</td>
                                    <td style="font-weight: 700; color: var(--success);">${formatCurrency(ref.commission)}</td>
                                    <td>
                                        <span class="badge ${ref.level === 1 ? 'badge-success' : 'badge-primary'}">
                                            Level ${ref.level}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="badge ${ref.status === 'active' ? 'badge-success' : 'badge-warning'}">
                                            ${ref.status}
                                        </span>
                                    </td>
                                    <td style="color: var(--text-secondary);">${formatDate(ref.createdAt)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align: center; padding: 48px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 16px;">🤝</div>
                    <div style="font-size: 16px;">No referrals yet</div>
                </div>
            `}
        </div>
    `;
    
    return renderLayout(content, 'referral');
}

function copyReferralLink() {
    const link = $('#referralLink');
    link.select();
    document.execCommand('copy');
    showToast('Referral link copied to clipboard!', 'success');
}

function shareVia(platform) {
    const link = encodeURIComponent(document.getElementById('referralLink').value);
    const text = encodeURIComponent('Join SwiftCipher and start earning! Use my referral link:');
    
    let url;
    switch(platform) {
        case 'whatsapp':
            url = `https://wa.me/?text=${text}%20${link}`;
            break;
        case 'telegram':
            url = `https://t.me/share/url?url=${link}&text=${text}`;
            break;
        case 'twitter':
            url = `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
            break;
    }
    
    window.open(url, '_blank');
}

// Export functions to global scope
window.renderTrading = renderTrading;
window.selectTradingPair = selectTradingPair;
window.setTradeType = setTradeType;
window.setLeverage = setLeverage;
window.calculateTradeSize = calculateTradeSize;
window.placeTrade = placeTrade;
window.closeTrade = closeTrade;
window.initTradingCharts = initTradingCharts;
window.updateTradingChart = updateTradingChart;
window.renderReferral = renderReferral;
window.copyReferralLink = copyReferralLink;
window.shareVia = shareVia;
