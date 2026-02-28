// ===================== WITHDRAWABLE AMOUNT RULE =====================
// Before completion: withdrawable = 20% of invested amount (kept as existing rule)
// After completion:  withdrawable = full investment + full profit + $50 bonus (bonus unlocks only after any completion)
function getWithdrawableAmount(userId) {
    const invs = getUserInvestmentsComputed(userId);
    if (!invs || invs.length === 0) return 0;

    let total = 0;
    let hasCompleted = false;

    invs.forEach(function(inv) {
        if (inv.status === 'completed') {
            hasCompleted = true;
            // Full capital + full profit (interestAccrued is profitEarned)
            total += (inv.amount || 0) + (inv.interestAccrued || 0);
        } else if (inv.status === 'active') {
            // Early withdrawal (before completion)
            total += (inv.amount || 0) * 0.20;
        }
    });

    // Registration bonus unlocks only after completing at least one investment
    if (hasCompleted) {
        try {
            const u = (typeof getUsers === 'function') ? getUsers().find(x => x && x.id === userId) : null;
            const bonus = (u && typeof u.registrationBonus === 'number') ? u.registrationBonus : 0;
            total += bonus;
        } catch (e) {}
    }

    return total;
}
window.getWithdrawableAmount = getWithdrawableAmount;

// WALLET PAGE
function renderWallet() {
    const user = APP.currentUser;
    const transactions = getTransactions().filter(t => t.userId === user.id);
    
    // Calculate total portfolio value
    let totalValue = 0;
    Object.keys(user.wallets).forEach(crypto => {
        totalValue += user.wallets[crypto] * APP.prices[crypto];
    });
    totalValue += user.investmentWallet + user.referralWallet + user.tradingBalance;
    
    const withdrawable = getWithdrawableAmount(user.id);
    
    const content = `
        <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 8px;">Wallet</h1>
        <p style="color: var(--text-secondary); font-size: 16px; margin-bottom: 32px;">Manage your crypto assets and balances</p>
        
        <!-- Total Balance -->
        <div class="card" style="margin-bottom: 32px; background: linear-gradient(135deg, var(--accent) 0%, #5549E6 100%); border: none; color: white;">
            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Total Balance</div>
            <div style="font-size: 48px; font-weight: 800; margin-bottom: 16px;">${formatCurrency(totalValue)}</div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="openGlobalDepositModal()">
                    ⬇️ Deposit
                </button>
                <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="scrollToWithdrawSection()">
                    ⬆️ Withdraw
                </button>
                <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="navigate('#/exchange')">
                    🔄 Swap
                </button>
            </div>
        </div>
        
        <!-- Wallet Cards -->
        <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Crypto Wallets</h3>
        <div class="grid-responsive-3" style="margin-bottom: 32px;">
            ${Object.keys(user.wallets).map(crypto => {
                const balance = user.wallets[crypto];
                const value = balance * APP.prices[crypto];
                const icon = crypto === 'BTC' ? '₿' : crypto === 'ETH' ? 'Ξ' : crypto === 'BNB' ? '🔸' : crypto === 'SOL' ? '◎' : crypto === 'ADA' ? '₳' : '₮';
                
                return `
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div style="font-size: 32px;">${icon}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${crypto}</div>
                        </div>
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 24px; font-weight: 800; margin-bottom: 4px;">${formatCrypto(balance, 6)}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">≈ ${formatCurrency(value)}</div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary" style="flex: 1; padding: 8px; font-size: 12px;" onclick="openDepositModal('${crypto}')">
                                Deposit
                            </button>
                            <button class="btn btn-secondary" style="flex: 1; padding: 8px; font-size: 12px;" onclick="openWithdrawModal('${crypto}')">
                                Withdraw
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- Other Wallets -->
        <!-- Investment Wallet Summary (Auto-updated) -->
        <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Other Accounts</h3>
        <div class="grid-responsive-3" style="margin-bottom: 32px;">
            <div class="card" style="background: linear-gradient(135deg, rgba(0, 212, 170, 0.1) 0%, rgba(0, 212, 170, 0.05) 100%); border-color: rgba(0, 212, 170, 0.2);">
                <div style="font-size: 32px; margin-bottom: 12px;">💼</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Investment Wallet</div>
                <div style="font-size: 28px; font-weight: 800; color: var(--success);">${formatCurrency(user.investmentWallet)}</div>
            </div>
            
            <div class="card" style="background: linear-gradient(135deg, rgba(255, 165, 2, 0.1) 0%, rgba(255, 165, 2, 0.05) 100%); border-color: rgba(255, 165, 2, 0.2);">
                <div style="font-size: 32px; margin-bottom: 12px;">🤝</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Referral Wallet</div>
                <div style="font-size: 28px; font-weight: 800; color: var(--warning);">${formatCurrency(user.referralWallet)}</div>
            </div>
            
            <div class="card" style="background: linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(108, 99, 255, 0.05) 100%); border-color: rgba(108, 99, 255, 0.2);">
                <div style="font-size: 32px; margin-bottom: 12px;">📈</div>
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Trading Account</div>
                <div style="font-size: 28px; font-weight: 800; color: var(--accent);">${formatCurrency(user.tradingBalance)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                    P&L: <span style="color: ${user.tradingBalance >= user.tradingStarting ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
                        ${formatCurrency(user.tradingBalance - user.tradingStarting)}
                    </span>
                </div>
            </div>
        </div>
        
        <!-- Investment Wallet Summary -->
        ${(() => {
            const s = getWalletInvestmentSummary(user.id);
            const wAmt = getWithdrawableAmount(user.id);
            const invs = getUserInvestmentsComputed(user.id);
            const hasCompleted = invs.some(i => i.status === 'completed');
            const hasActive = invs.some(i => i.status === 'active');
            return `
                <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Investment Wallet</h3>
                <div class="grid-responsive-3" style="margin-bottom: 32px;">
                    <div class="card" style="background: linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(108, 99, 255, 0.05) 100%); border-color: rgba(108, 99, 255, 0.2);">
                        <div style="font-size: 32px; margin-bottom: 12px;">💼</div>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Invested</div>
                        <div style="font-size: 28px; font-weight: 800; color: var(--accent);" id="walletTotalInvested">${formatCurrency(s.totalInvested)}</div>
                    </div>
                    <div class="card" style="background: linear-gradient(135deg, rgba(0, 212, 170, 0.1) 0%, rgba(0, 212, 170, 0.05) 100%); border-color: rgba(0, 212, 170, 0.2);">
                        <div style="font-size: 32px; margin-bottom: 12px;">📈</div>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Interest Earned</div>
                        <div style="font-size: 28px; font-weight: 800; color: var(--success);" id="walletInterestEarned">${formatCurrency(s.interestEarned)}</div>
                        ${s.totalInvested > 0 ? `<div style="font-size:12px; margin-top:6px;"><span class="inv-engine-status" style="font-weight:700; color:${hasCompleted ? 'var(--success)' : 'var(--warning)'}">${hasCompleted ? '\u2705 Completed' : '\u23f3 In Progress'}</span></div>` : ''}
                    </div>
                    <div class="card" style="background: linear-gradient(135deg, rgba(255, 165, 2, 0.1) 0%, rgba(255, 165, 2, 0.05) 100%); border-color: rgba(255, 165, 2, 0.2);">
                        <div style="font-size: 32px; margin-bottom: 12px;">💳</div>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Available Balance</div>
                        <div style="font-size: 28px; font-weight: 800; color: var(--warning);" id="walletAvailableBalance">${formatCurrency(s.availableBalance)}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">Pending: <span style="font-weight: 700;" id="walletPendingPayments">${formatCurrency(s.pendingPayments)}</span></div>
                    </div>
                </div>
                <!-- Withdrawable Amount Banner -->
                <div style="margin-bottom: 24px; padding: 16px; background: linear-gradient(135deg, rgba(0,212,170,0.12) 0%, rgba(0,212,170,0.04) 100%); border: 1px solid rgba(0,212,170,0.3); border-radius: 14px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                    <div style="font-size:28px;">💸</div>
                    <div style="flex:1;">
                        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:4px;">
                            ${hasCompleted ? 'Investment complete — Full capital + profit available' : hasActive ? 'Investment active — 20% available for early withdrawal' : 'No active investment'}
                        </div>
                        <div style="font-size:22px; font-weight:800; color:var(--success);" id="walletWithdrawableAmt">${formatCurrency(wAmt)}</div>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary); max-width:200px; text-align:right;">
                        ${hasCompleted ? 'Full withdrawal unlocked' : hasActive ? 'Wallet withdrawable = 20% of invested amount' : ''}
                    </div>
                </div>
            `;
        })()}

        <!-- ===================== WITHDRAWAL SECTION ===================== -->
        <div class="card" style="margin-bottom: 32px;" id="withdrawalSection">
            <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 20px;">💸 Withdraw Funds</h3>

            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Select Coin</label>
                <select class="input" id="withdrawCoinSelect" onchange="onWithdrawCoinChange()" style="margin-bottom: 8px;">
                    <option value="Bitcoin">Bitcoin (BTC)</option>
                    <option value="USDT" selected>USDT (ERC20)</option>
                    <option value="Ethereum">Ethereum (ETH)</option>
                    <option value="Smart Chain (BEP20)">Smart Chain (BEP20)</option>
                    <option value="Solana">Solana (SOL)</option>
                    <option value="ADA (Cardano)">ADA (Cardano)</option>
                </select>
            </div>

            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 16px; font-size: 13px;">
                <span style="color: var(--text-secondary);">Send only to this coin's network address. Wrong network = permanent loss.</span>
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Your Wallet Address (Destination)</label>
                <input class="input" id="withdrawDestAddress" placeholder="Enter your external wallet address" style="font-family: monospace;">
            </div>

            <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Amount (USD)</label>
                <div style="position: relative;">
                    <input type="number" class="input" id="withdrawUsdAmount" placeholder="Enter amount" min="10" style="padding-right: 70px;">
                    <span style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-secondary);">USD</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">
                    Withdrawable amount: <strong id="withdrawAvailBal">${formatCurrency(getWithdrawableAmount(user.id))}</strong>
                </div>
            </div>

            <button class="btn btn-primary" style="width: 100%;" onclick="submitWithdrawalRequest()">
                Submit Withdrawal Request
            </button>

            <!-- Withdrawal History -->
            <div style="margin-top: 24px;">
                <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">Withdrawal History</h4>
                <div id="withdrawalHistoryList">${renderWithdrawalHistory(user.id)}</div>
            </div>
        </div>

        <!-- Cashout / Withdrawal Details -->
        <div class="card" style="margin-bottom: 32px;">
            <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="font-size: 20px; font-weight: 700;">Cashout Details</h3>
                <button class="btn btn-secondary" style="padding: 8px 12px; font-size: 12px;" onclick="openCashoutDetailsModal()">Edit</button>
            </div>
            <div style="display:grid; gap: 10px; font-size: 14px;">
                <div style="display:flex; justify-content: space-between; gap: 16px;"><span style="color: var(--text-secondary);">Crypto Address</span><span style="font-weight: 600; font-family: monospace;">${(user.cashoutDetails?.cryptoAddress || '-') || '-'}</span></div>
                <div style="display:flex; justify-content: space-between; gap: 16px;"><span style="color: var(--text-secondary);">Bank Name</span><span style="font-weight: 600;">${user.cashoutDetails?.bankName || '-'}</span></div>
                <div style="display:flex; justify-content: space-between; gap: 16px;"><span style="color: var(--text-secondary);">Account Name</span><span style="font-weight: 600;">${user.cashoutDetails?.accountName || '-'}</span></div>
                <div style="display:flex; justify-content: space-between; gap: 16px;"><span style="color: var(--text-secondary);">Account Number</span><span style="font-weight: 600;">${user.cashoutDetails?.accountNumber || '-'}</span></div>
            </div>
        </div>

        <div id="cashoutDetailsModal" style="display:none;"></div>

        <!-- SUPER ADMIN PANEL BUTTON (visible only to Super Admins) -->
        ${isSuperAdmin() ? `
        <div style="margin-bottom: 24px; padding: 16px; background: linear-gradient(135deg, rgba(255,71,87,0.1) 0%, rgba(255,71,87,0.05) 100%); border: 1px solid rgba(255,71,87,0.3); border-radius: 16px; display:flex; align-items:center; justify-content:space-between; gap:16px;">
            <div>
                <div style="font-size:16px; font-weight:700; color:var(--danger);">🛡️ Super Admin Panel</div>
                <div style="font-size:13px; color:var(--text-secondary);">Manage users, confirm payments, view receipts</div>
            </div>
            <button class="btn btn-danger" onclick="navigate('#/admin')" style="white-space:nowrap;">
                Open Admin
            </button>
        </div>
        ` : ''}

        <!-- Transaction History -->
        <div class="card">
            <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Transaction History</h3>
            ${transactions.length > 0 ? `
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Details</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transactions.slice(0, 20).map(tx => `
                                <tr>
                                    <td>
                                        <span style="font-weight: 600; text-transform: capitalize;">
                                            ${tx.type.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td style="color: var(--text-secondary);">
                                        ${tx.currency || ''}
                                        ${tx.fromCurrency ? tx.fromCurrency + ' → ' + tx.toCurrency : ''}
                                        ${tx.plan ? tx.plan + ' Plan' : ''}
                                        ${tx.pair ? tx.pair : ''}
                                    </td>
                                    <td style="font-weight: 700;">
                                        ${tx.amount ? formatCurrency(tx.amount) : ''}
                                        ${tx.profit ? formatCurrency(tx.profit) : ''}
                                    </td>
                                    <td>
                                        <span class="badge badge-success">${tx.status}</span>
                                    </td>
                                    <td style="color: var(--text-secondary);">
                                        ${formatDateTime(tx.createdAt)}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : `
                <div style="text-align: center; padding: 48px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
                    <div style="font-size: 16px;">No transactions yet</div>
                </div>
            `}
        </div>
        
        <!-- Modals -->
        <div id="depositModal" style="display: none;"></div>
        <div id="withdrawModal" style="display: none;"></div>
    `;
    
    return renderLayout(content, 'wallet');
}

function openDepositModal(crypto) {
    openGlobalDepositModal(crypto);
}

function openGlobalDepositModal(cryptoHint) {
    const modal = $('#depositModal');
    modal.style.display = 'flex';

    // Map crypto wallet ticker to COIN_ADDRESSES key
    const coinMap = {
        'BTC': 'Bitcoin',
        'ETH': 'Ethereum',
        'BNB': 'Smart Chain (BEP20)',
        'SOL': 'Solana',
        'ADA': 'ADA (Cardano)',
        'USDT': 'USDT'
    };

    const defaultCoin = coinMap[cryptoHint] || 'USDT';

    modal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="font-size: 24px; font-weight: 800;">Deposit Crypto</h3>
                    <button onclick="closeDepositModal()" style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-secondary); border: none; cursor: pointer; font-size: 20px;">×</button>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Select Coin</label>
                    <select class="input" id="depositCoinSelect" onchange="updateDepositAddress()">
                        <option value="Bitcoin" ${defaultCoin==='Bitcoin'?'selected':''}>Bitcoin (BTC)</option>
                        <option value="USDT" ${defaultCoin==='USDT'?'selected':''}>USDT (ERC20)</option>
                        <option value="Ethereum" ${defaultCoin==='Ethereum'?'selected':''}>Ethereum (ETH)</option>
                        <option value="Smart Chain (BEP20)" ${defaultCoin==='Smart Chain (BEP20)'?'selected':''}>Smart Chain (BEP20)</option>
                        <option value="Solana" ${defaultCoin==='Solana'?'selected':''}>Solana (SOL)</option>
                        <option value="ADA (Cardano)" ${defaultCoin==='ADA (Cardano)'?'selected':''}>ADA (Cardano)</option>
                    </select>
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Deposit Address</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" class="input" id="depositAddress" readonly style="flex: 1; font-size: 12px; font-family: monospace;">
                        <button class="btn btn-primary" onclick="copyDepositAddress()">Copy</button>
                    </div>
                </div>

                <div style="padding: 16px; background: rgba(255, 165, 2, 0.1); border-radius: 12px; border: 1px solid rgba(255, 165, 2, 0.2);">
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ⚠️ <strong>Important:</strong> Only send the selected coin to this address. Sending other assets will result in permanent loss.
                    </div>
                </div>
            </div>
        </div>
    `;

    // Set initial address
    setTimeout(updateDepositAddress, 50);
}

function closeDepositModal() {
    $('#depositModal').style.display = 'none';
}

function copyDepositAddress() {
    const address = $('#depositAddress');
    address.select();
    document.execCommand('copy');
    showToast('Address copied to clipboard!', 'success');
}

function openWithdrawModal(crypto) {
    const modal = $('#withdrawModal');
    modal.style.display = 'flex';
    
    const balance = APP.currentUser.wallets[crypto];
    
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="font-size: 24px; font-weight: 800;">Withdraw ${crypto}</h3>
                    <button onclick="closeWithdrawModal()" style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-secondary); border: none; cursor: pointer; font-size: 20px;">×</button>
                </div>
                
                <div style="padding: 16px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 16px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Available Balance</div>
                    <div style="font-size: 24px; font-weight: 800;">${formatCrypto(balance, 6)} ${crypto}</div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Destination Address</label>
                    <input type="text" class="input" placeholder="Enter ${crypto} address" id="withdrawAddress">
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Amount</label>
                    <div style="position: relative;">
                        <input type="number" class="input" placeholder="0.00" id="withdrawAmount" max="${balance}" style="padding-right: 60px;">
                        <button class="btn btn-secondary" style="position: absolute; right: 4px; top: 4px; padding: 6px 12px; font-size: 12px;" onclick="$('#withdrawAmount').value = ${balance}">MAX</button>
                    </div>
                </div>
                
                <div style="padding: 16px; background: rgba(108, 99, 255, 0.1); border-radius: 12px; margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 14px; color: var(--text-secondary);">Network Fee</span>
                        <span style="font-size: 14px; font-weight: 600;">0.0005 ${crypto}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-size: 14px; color: var(--text-secondary);">You will receive</span>
                        <span style="font-size: 14px; font-weight: 700; color: var(--success);" id="withdrawReceive">0.00 ${crypto}</span>
                    </div>
                </div>
                
                <button class="btn btn-primary" style="width: 100%;" onclick="confirmWithdraw('${crypto}')">
                    Confirm Withdrawal
                </button>
            </div>
        </div>
    `;
    
    // Calculate receive amount on input
    $('#withdrawAmount')?.addEventListener('input', function() {
        const amount = parseFloat(this.value) || 0;
        const receive = Math.max(0, amount - 0.0005);
        const el = $('#withdrawReceive');
        if (el) el.textContent = formatCrypto(receive, 6) + ' ' + crypto;
    });
}

function closeWithdrawModal() {
    $('#withdrawModal').style.display = 'none';
}

function confirmWithdraw(crypto) {
    const address = $('#withdrawAddress')?.value;
    const amount = parseFloat($('#withdrawAmount')?.value) || 0;
    
    if (!address) {
        showToast('Please enter destination address', 'error');
        return;
    }
    
    if (amount <= 0 || amount > APP.currentUser.wallets[crypto]) {
        showToast('Invalid amount', 'error');
        return;
    }

    // Deduct from wallet (in-memory) + persist to Supabase wallet.balance (USDT mapping)
    APP.currentUser.wallets[crypto] = Math.max(0, (APP.currentUser.wallets[crypto] || 0) - amount);

    if (window.sb && typeof window.sbUpdateUserById === 'function') {
        const nextWallet = {
            ...(APP.currentUser._dbWallet || {}),
            balance: Number(APP.currentUser.wallets?.USDT || 0),
            pending: Number(APP.currentUser._dbWallet?.pending || 0)
        };
        window.sbUpdateUserById(APP.currentUser.id, { wallet: nextWallet }).then((row) => {
            if (row) APP.currentUser._dbWallet = row.wallet || nextWallet;
        }).catch(() => {});
    }

    // Persist withdrawal record
    persistWithdrawalRecord({
        coin: crypto,
        coinType: crypto,
        address,
        amount,
        amountUsd: amount * (APP.prices[crypto] || 1),
        status: 'Pending'
    });

    addTransaction({
        type: 'withdraw',
        currency: crypto,
        amount,
        address,
        status: 'Pending'
    });
    
    showToast('Withdrawal request submitted successfully', 'success');
    closeWithdrawModal();
    setTimeout(() => render(), 400);
}

// ADMIN PAGE
function renderAdmin() {
    // Super Admin or Sub Admin
    if (!(typeof isAnyAdmin === 'function' && isAnyAdmin())) {
        navigate('#/dashboard');
        return '';
    }

    // NOTE: Users are loaded from Supabase (async fetch).
    const users = (window.__ADMIN_USERS_CACHE || []);

    // Trigger async load if cache is empty
    if ((!users || users.length === 0) && typeof adminEnsureUsersLoaded === 'function') {
        adminEnsureUsersLoaded();
    }
    const investments = [];
    const trades = [];
    
    const totalUsers = (users || []).length;
    const totalInvestments = (users || []).reduce((sum, u) => sum + Number((u.investment && u.investment.amount) || 0), 0);
    const totalRevenue = totalInvestments * 0.05; // Simple demo calc
    const totalVolume = 0;
    
    const content = `
        <h1 style="font-size: 32px; font-weight: 800; margin-bottom: 8px;">Admin Dashboard</h1>
        <p style="color: var(--text-secondary); font-size: 16px; margin-bottom: 32px;">Platform management and analytics</p>
        
        <!-- Platform Stats -->
        <div class="grid-responsive" style="margin-bottom: 32px;">
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Users</div>
                <div style="font-size: 32px; font-weight: 800;">${totalUsers}</div>
                <div style="font-size: 14px; color: var(--success); margin-top: 4px;">+12 this month</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Active Investments</div>
                <div style="font-size: 32px; font-weight: 800;">${formatCurrency(totalInvestments)}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Platform Revenue</div>
                <div style="font-size: 32px; font-weight: 800; color: var(--success);">${formatCurrency(totalRevenue)}</div>
            </div>
            <div class="stat-card">
                <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Trading Volume</div>
                <div style="font-size: 32px; font-weight: 800;">${formatCurrency(totalVolume)}</div>
            </div>
        </div>
        
        <div class="grid-responsive-2">
            <!-- User Signups Chart -->
            <div class="card">
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">User Signups (Last 7 Days)</h3>
                <canvas id="signupsChart" style="height: 250px;"></canvas>
            </div>
            
            <!-- Revenue Chart -->
            <div class="card">
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Revenue (Last 7 Days)</h3>
                <canvas id="revenueChart" style="height: 250px;"></canvas>
            </div>
        </div>
        
        ${typeof isSuperAdmin === 'function' && isSuperAdmin() ? `
        <!-- Pending Investment Payments -->
        <div class="card" style="margin-top: 32px;">
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 16px;">
                <h3 style="font-size: 20px; font-weight: 700;">Pending Investment Payments</h3>
                <div class="badge badge-warning">Super Admin Only</div>
            </div>
            ${(() => {
                const pending = getInvestmentPayments().filter(p => p.status === 'Pending');
                if (pending.length === 0) {
                    return `<div style="text-align:center; padding: 32px; color: var(--text-secondary);">No pending payments</div>`;
                }
                return `
                    <div style="overflow-x:auto;">
                        <table>
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Plan</th>
                                    <th>Amount</th>
                                    <th>Address</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pending.map(p => {
                                    const u = getUsers().find(x => x.id === p.userId);
                                    const receiptDataUrl = (p.receipt && p.receipt.dataUrl) || p.receiptFile || '';
                                    const hasReceipt = !!receiptDataUrl;
                                    return `
                                        <tr>
                                            <td style="font-weight: 600;">
                                                ${u ? u.name : p.userId}<br>
                                                <span style="font-size:11px;color:var(--text-secondary);">${u ? u.email : ''}</span>
                                            </td>
                                            <td>${p.plan}</td>
                                            <td style="font-weight:700;">${formatCurrency(p.amount)}</td>
                                            <td style="font-family: monospace; font-size:11px;">${(p.paymentAddress||'').substring(0,18)}...</td>
                                            <td style="color: var(--text-secondary);">${formatDateTime(p.createdAt)}</td>
                                            <td>
                                                <div style="display:flex; gap: 8px; flex-wrap:wrap;">
                                                    ${hasReceipt ? `<button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="viewReceiptInModal('${p.id}')">👁 Receipt</button>` : '<span style="font-size:11px;color:var(--text-secondary);">No receipt</span>'}
                                                    <button class="btn btn-success" style="padding: 4px 12px; font-size: 12px; opacity:${hasReceipt ? 1 : 0.5};" ${hasReceipt ? '' : 'disabled'} onclick="${hasReceipt ? `confirmInvestmentPayment('${p.id}')` : `showToast('Cannot approve: receipt not uploaded', 'error')`}">✓ Confirm</button>
                                                    <button class="btn btn-danger" style="padding: 4px 12px; font-size: 12px;" onclick="rejectInvestmentPayment('${p.id}')">✗ Reject</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            })()}
        </div>
        ` : ''}

        <!-- Users Management -->
        <div class="card" style="margin-top: 32px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="font-size: 20px; font-weight: 700;">Users Management</h3>
                <input type="text" class="input" placeholder="🔍 Search users..." style="max-width: 300px;" id="userSearch" oninput="filterUsers()">
            </div>
            
            <div style="overflow-x: auto;">
                <table id="usersTable">
                    <thead>
                        <tr>
                            <th>User Name</th>
                            <th>Email</th>
                            <th>Amount Invested</th>
                            <th>Receipt</th>
                            <th>Status</th>
                            <th>Approve</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(users || []).map(user => {
                            const invSummary = { totalInvested: Number((user.investment && user.investment.amount) || 0) };

                            const receiptDataUrl = '';
                            const hasReceipt = false;

                            const receiptStatus = (user.status || 'active');
                            const statusBadge = (String(receiptStatus).toLowerCase() === 'active')
                                ? 'badge-success'
                                : 'badge-danger';

                            const amountInvested = invSummary.totalInvested || 0;

                            const canApprove = false;

                            return `
                                <tr>
                                    <td style="font-weight: 600;">${user.name || '-'}</td>
                                    <td style="color: var(--text-secondary); font-size:13px;">${user.email || '-'}</td>
                                    <td style="font-weight:700; color:var(--accent);">${formatCurrency(amountInvested)}</td>
                                    <td>
                                        <span style="font-size:11px;color:var(--text-secondary);">-</span>
                                    </td>
                                    <td>
                                        <span class="badge ${statusBadge}">${String(receiptStatus || 'active')}</span>
                                    <div style="font-size:11px;color:var(--text-secondary); margin-top:4px;">Role: <strong>${String(user.role||'user')}</strong></div>
                                    </td>
                                    <td>
                                        ${(() => {
                                            const role = user.role || 'user';
                                            const isSA = (role === 'super_admin');
                                            const canEdit = (typeof isSuperAdmin === 'function' && isSuperAdmin()) && !isSA;
                                            const myIsSub = (typeof isSubAdmin === 'function' && isSubAdmin());

                                            if (myIsSub) {
                                                return `<span style="font-size:11px;color:var(--text-secondary);">View only</span>`;
                                            }

                                            // ---- Approve Investment button ----
                                            const invAmt    = Number((user.investment && user.investment.amount) || 0);
                                            const invStatus = (user.investment && user.investment.status) || 'inactive';
                                            const isAlreadyActive = (invStatus === 'active' || invStatus === 'completed');
                                            const approveBtn = canEdit
                                                ? (invAmt > 0
                                                    ? `<button class="btn ${isAlreadyActive ? 'btn-secondary' : 'btn-success'}" style="padding:4px 10px; font-size:11px;" ${isAlreadyActive ? 'disabled title="Already active"' : ''} onclick="adminApproveInvestment('${user.id}')">${isAlreadyActive ? '✓ Active' : '✅ Approve Inv.'}</button>`
                                                    : `<button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" disabled title="No investment amount set">No Inv.</button>`)
                                                : '';

                                            return `
                                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                                    ${approveBtn}
                                                    <select class="input" style="padding:6px 10px; font-size:11px; max-width:140px;" ${canEdit ? '' : 'disabled'} onchange="adminChangeUserRole('${user.id}', this.value)">
                                                        <option value="user" ${role==='user'?'selected':''}>user</option>
                                                        <option value="sub_admin" ${role==='sub_admin'?'selected':''}>sub_admin</option>
                                                    </select>
                                                    <button class="btn btn-secondary" style="padding:4px 10px; font-size:11px;" ${canEdit ? '' : 'disabled'} onclick="adminSetUserStatus('${user.id}', '${String(user.status||'active').toLowerCase()==='active' ? 'suspended' : 'active'}')">
                                                        ${String(user.status||'active').toLowerCase()==='active' ? 'Suspend' : 'Activate'}
                                                    </button>
                                                    <button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" ${canEdit ? '' : 'disabled'} onclick="adminDeleteUser('${user.id}')">Delete</button>
                                                </div>
                                            `;
                                        })()}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        

        <!-- Edit Balance Modal -->
        <div id="editBalanceModal" style="display: none;"></div>
    `;
    
    return renderLayout(content, 'admin');
}

function initAdminCharts() {
    // Signups Chart
    const signupDays = [];
    const signupCounts = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        signupDays.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        signupCounts.push(Math.floor(Math.random() * 10) + 5);
    }
    
    const signupsCtx = document.getElementById('signupsChart');
    if (signupsCtx) {
        new Chart(signupsCtx, {
            type: 'bar',
            data: {
                labels: signupDays,
                datasets: [{
                    label: 'Signups',
                    data: signupCounts,
                    backgroundColor: '#6C63FF',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
                    },
                    y: {
                        grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border') },
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
                    }
                }
            }
        });
    }
    
    // Revenue Chart
    const revenueDays = [];
    const revenueCounts = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        revenueDays.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        revenueCounts.push(Math.random() * 5000 + 2000);
    }
    
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        new Chart(revenueCtx, {
            type: 'line',
            data: {
                labels: revenueDays,
                datasets: [{
                    label: 'Revenue',
                    data: revenueCounts,
                    borderColor: '#00D4AA',
                    backgroundColor: 'rgba(0, 212, 170, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary') }
                    },
                    y: {
                        grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border') },
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }
}

function filterUsers() {
    const search = $('#userSearch')?.value.toLowerCase() || '';
    const rows = $$('#usersTable tbody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function editUserBalance(userId) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    
    if (!user) return;
    
    const modal = $('#editBalanceModal');
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="font-size: 24px; font-weight: 800;">Edit User Balance</h3>
                    <button onclick="closeEditBalanceModal()" style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-secondary); border: none; cursor: pointer; font-size: 20px;">×</button>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px;">User: ${user.name} (${user.email})</div>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Investment Wallet</label>
                    <input type="number" class="input" value="${user.investmentWallet}" id="editInvestmentWallet">
                </div>
                
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Referral Wallet</label>
                    <input type="number" class="input" value="${user.referralWallet}" id="editReferralWallet">
                </div>
                
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Trading Balance</label>
                    <input type="number" class="input" value="${user.tradingBalance}" id="editTradingBalance">
                </div>
                
                <button class="btn btn-primary" style="width: 100%;" onclick="saveUserBalance('${userId}')">
                    Save Changes
                </button>
            </div>
        </div>
    `;
}

function closeEditBalanceModal() {
    $('#editBalanceModal').style.display = 'none';
}

function saveUserBalance(userId) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) return;
    
    users[userIndex].investmentWallet = parseFloat($('#editInvestmentWallet')?.value) || 0;
    users[userIndex].referralWallet = parseFloat($('#editReferralWallet')?.value) || 0;
    users[userIndex].tradingBalance = parseFloat($('#editTradingBalance')?.value) || 0;
    
    saveUsers(users);
    
    closeEditBalanceModal();
    showToast('User balance updated successfully', 'success');
    setTimeout(() => render(), 500);
}

function suspendUser(userId) {
    // Backward compatible hook (admin-supabase.js does the real work)
    if (typeof adminSetUserStatus === 'function') {
        adminSetUserStatus(userId, 'suspended');
    }
}

// Export functions to global scope
window.renderWallet = renderWallet;
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.copyDepositAddress = copyDepositAddress;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.confirmWithdraw = confirmWithdraw;
window.renderAdmin = renderAdmin;
window.initAdminCharts = initAdminCharts;
window.filterUsers = filterUsers;
window.editUserBalance = editUserBalance;
window.closeEditBalanceModal = closeEditBalanceModal;
window.saveUserBalance = saveUserBalance;
window.suspendUser = suspendUser;


// CASHOUT DETAILS MODAL
function openCashoutDetailsModal() {
    const modal = document.getElementById('cashoutDetailsModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const user = APP.currentUser;
    const d = user.cashoutDetails || {};

    modal.innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 24px;">
                    <h3 style="font-size: 24px; font-weight: 800;">Cashout Details</h3>
                    <button onclick="closeCashoutDetailsModal()" style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-secondary); border: none; cursor: pointer; font-size: 20px;">×</button>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display:block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Crypto Address</label>
                    <input class="input" id="cashoutCryptoAddress" value="${d.cryptoAddress || ''}" placeholder="Enter your wallet address">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display:block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Bank Name</label>
                    <input class="input" id="cashoutBankName" value="${d.bankName || ''}" placeholder="Bank name">
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display:block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Account Name</label>
                    <input class="input" id="cashoutAccountName" value="${d.accountName || ''}" placeholder="Account name">
                </div>

                <div style="margin-bottom: 24px;">
                    <label style="display:block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Account Number</label>
                    <input class="input" id="cashoutAccountNumber" value="${d.accountNumber || ''}" placeholder="Account number">
                </div>

                <button class="btn btn-primary" style="width: 100%;" onclick="saveCashoutDetails()">Save</button>
            </div>
        </div>
    `;
}

function closeCashoutDetailsModal() {
    const modal = document.getElementById('cashoutDetailsModal');
    if (modal) modal.style.display = 'none';
}

function saveCashoutDetails() {
    // In Supabase mode, cashoutDetails remains client-side only (no schema provided).
    APP.currentUser.cashoutDetails = {
        cryptoAddress: document.getElementById('cashoutCryptoAddress')?.value || '',
        bankName: document.getElementById('cashoutBankName')?.value || '',
        accountName: document.getElementById('cashoutAccountName')?.value || '',
        accountNumber: document.getElementById('cashoutAccountNumber')?.value || ''
    };

    closeCashoutDetailsModal();
    showToast('Cashout details updated', 'success');
    setTimeout(() => render(), 300);
}

window.openCashoutDetailsModal = openCashoutDetailsModal;
window.closeCashoutDetailsModal = closeCashoutDetailsModal;
window.saveCashoutDetails = saveCashoutDetails;


// SUPER ADMIN - PAYMENT CONFIRMATION
function updatePaymentTransactionStatus(userId, paymentId, newStatus) {
    const txs = getTransactions();
    let changed = false;

    txs.forEach(tx => {
        if (tx.userId === userId && tx.type === 'investment_payment' && tx.paymentId === paymentId) {
            tx.status = newStatus; // Pending / Confirmed / Rejected
            tx.updatedAt = Date.now();
            changed = true;
        }
    });

    if (changed) saveTransactions(txs);
}

function confirmInvestmentPayment(paymentId) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
        showToast('Super Admin permission required', 'error');
        return;
    }

    const payments = getInvestmentPayments();
    const idx = payments.findIndex(p => p.id === paymentId);
    if (idx === -1) return;

    const p = payments[idx];
    if (p.status !== 'Pending') {
        showToast('Payment is not pending', 'info');
        return;
    }

    // Mark payment confirmed
    payments[idx].status = 'Confirmed';
    payments[idx].receiptStatus = 'Confirmed';
    payments[idx].investmentStatus = 'ACTIVE';
    payments[idx].confirmedAt = Date.now();
    payments[idx].confirmedBy = APP.currentUser.id;
    saveInvestmentPayments(payments);

    // Activate investment (growth starts immediately, per-minute)
    const investments = getInvestments();
    const now = Date.now();
    const durationDays = p.duration;
    const totalReturnRate = (typeof p.totalReturnRate === 'number') ? p.totalReturnRate : ((p.dailyROI || 0) * durationDays);

    investments.push({
        id: generateId(),
        userId: p.userId,
        plan: p.plan,
        planType: p.plan,
        amount: p.amount,
        dailyROI: p.dailyROI,
        duration: durationDays,

        // Required timer fields
        startTime: now,
        endTime: now + (durationDays * 24 * 60 * 60 * 1000),

        // Required profit fields
        totalReturnRate,
        profitEarned: 0,
        currentValue: p.amount,

        status: 'active',
        createdAt: now
    });
    saveInvestments(investments);

    // Update payment-linked transaction status (Pending -> Confirmed)
    updatePaymentTransactionStatus(p.userId, paymentId, 'Confirmed');

    // Add transactions for the user
    addTransactionForUser(p.userId, {
        type: 'investment',
        amount: p.amount,
        plan: p.plan,
        status: 'completed'
    });

    // Sync computed wallet to storage immediately (logic-only)
    if (typeof syncUserInvestmentWalletToStorage === 'function') {
        syncUserInvestmentWalletToStorage(p.userId);
    }

    // ===================== SUPABASE: Persist confirmed investment to DB =====================
    if (window.sbUpdateUserById && window.sbFetchAllUsers) {
        const confirmNow = Date.now();
        const sbInvPayload = {
            amount:    p.amount,
            profit:    0,
            completed: false,
            startTime: confirmNow,
            duration:  7
        };

        // Update the investing user's investment column in Supabase
        window.sbUpdateUserById(p.userId, { investment: sbInvPayload })
            .catch(function(err) {
                console.warn('[Admin] Failed to write investment to Supabase:', err);
            });

        // ===================== REFERRAL BONUS (20% of confirmed amount) =====================
        window.sbFetchAllUsers().then(function(allUsers) {
            const investingUser = (allUsers || []).find(function(u) {
                return u && (String(u.id) === String(p.userId));
            });

            if (!investingUser) return;

            // referredBy may be stored in investment or wallet jsonb
            const refBy = (investingUser.investment && investingUser.investment.referredBy)
                       || (investingUser.wallet && investingUser.wallet.referredBy)
                       || null;

            if (!refBy) return; // No referrer recorded

            const referrer = (allUsers || []).find(function(u) {
                return u && window.normalizeEmail(u.email) === window.normalizeEmail(refBy);
            });

            if (!referrer) return;

            const refBonus = Number(p.amount || 0) * 0.20;
            const currentBal = Number((referrer.wallet && referrer.wallet.balance) || 0);
            const updatedReferrerWallet = Object.assign({}, referrer.wallet || {}, {
                balance: currentBal + refBonus
            });

            window.sbUpdateUserById(referrer.id, { wallet: updatedReferrerWallet })
                .then(function() {
                    showToast('Referral bonus of ' + formatCurrency(refBonus) + ' added to referrer wallet', 'info');
                })
                .catch(function(err) {
                    console.warn('[Admin] Failed to write referral bonus:', err);
                });
        }).catch(function() {});
    }
    // ===================== END SUPABASE SYNC =====================

    // ===================== CONFIRMATION NOTIFICATION FLAG =====================
    // (Supabase mode) No localStorage notifications.


    showToast('Payment confirmed and investment activated', 'success');
    setTimeout(() => render(), 300);
}

function rejectInvestmentPayment(paymentId) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
        showToast('Super Admin permission required', 'error');
        return;
    }

    const payments = getInvestmentPayments();
    const idx = payments.findIndex(p => p.id === paymentId);
    if (idx === -1) return;

    // FIX: status is stored as 'Pending' (capital P), so compare correctly
    if (payments[idx].status !== 'Pending') {
        showToast('Payment is not pending', 'info');
        return;
    }

    payments[idx].status = 'Rejected';
    payments[idx].receiptStatus = 'Rejected';
    payments[idx].investmentStatus = 'INACTIVE';
    payments[idx].rejectedAt = Date.now();
    payments[idx].rejectedBy = APP.currentUser.id;
    saveInvestmentPayments(payments);

    // Update payment-linked transaction status (Pending -> Rejected)
    updatePaymentTransactionStatus(payments[idx].userId, paymentId, 'Rejected');

    // Ensure any derived wallet is recalculated (trading stops because no investment is created)
    if (typeof syncUserInvestmentWalletToStorage === 'function') {
        syncUserInvestmentWalletToStorage(payments[idx].userId);
    }

    showToast('Payment rejected', 'success');
    setTimeout(() => render(), 300);
}

window.confirmInvestmentPayment = confirmInvestmentPayment;
window.rejectInvestmentPayment = rejectInvestmentPayment;


// ===================== DEPOSIT ADDRESS HELPER =====================
function updateDepositAddress() {
    const sel = document.getElementById('depositCoinSelect');
    const inp = document.getElementById('depositAddress');
    if (!sel || !inp) return;
    const addrs = window.COIN_ADDRESSES || {};
    inp.value = addrs[sel.value] || '';
}
window.updateDepositAddress = updateDepositAddress;

// ===================== GLOBAL DEPOSIT MODAL =====================
window.openGlobalDepositModal = openGlobalDepositModal;

// ===================== SCROLL TO WITHDRAW SECTION =====================
function scrollToWithdrawSection() {
    const el = document.getElementById('withdrawalSection');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.style.boxShadow = '0 0 0 3px var(--accent)';
        setTimeout(() => { if (el) el.style.boxShadow = ''; }, 2000);
    } else {
        // Render wallet page first then scroll
        navigate('#/wallet');
        setTimeout(scrollToWithdrawSection, 600);
    }
}
window.scrollToWithdrawSection = scrollToWithdrawSection;

// ===================== WITHDRAWAL COIN CHANGE =====================
function onWithdrawCoinChange() {
    // Nothing special needed here currently – placeholder for extensibility
}
window.onWithdrawCoinChange = onWithdrawCoinChange;

// ===================== PERSIST WITHDRAWAL RECORD =====================
function persistWithdrawalRecord(record) {
    const key = 'cryptonexus_withdrawals';
    const all = JSON.parse(localStorage.getItem(key) || '[]');
    all.unshift({
        id: generateId(),
        userId: APP.currentUser.id,
        createdAt: Date.now(),
        ...record
    });
    localStorage.setItem(key, JSON.stringify(all));
}
window.persistWithdrawalRecord = persistWithdrawalRecord;

// ===================== RENDER WITHDRAWAL HISTORY =====================
function renderWithdrawalHistory(userId) {
    const key = 'cryptonexus_withdrawals';
    const all = JSON.parse(localStorage.getItem(key) || '[]');
    const mine = all.filter(w => w.userId === userId);
    if (mine.length === 0) {
        return '<div style="text-align:center; padding:24px; color:var(--text-secondary);">No withdrawal requests yet</div>';
    }
    return `<div style="overflow-x:auto;"><table>
        <thead><tr>
            <th>Coin</th><th>Address</th><th>Amount</th><th>Status</th><th>Date</th>
        </tr></thead>
        <tbody>
        ${mine.slice(0, 20).map(w => `
            <tr>
                <td style="font-weight:600;">${w.coin || w.coinType || '-'}</td>
                <td style="font-family:monospace; font-size:12px;">${(w.address||'').substring(0,20)}...</td>
                <td style="font-weight:700;">${formatCurrency(w.amountUsd || w.amount || 0)}</td>
                <td><span class="badge badge-warning">${w.status || 'Pending'}</span></td>
                <td style="color:var(--text-secondary);">${formatDate(w.createdAt)}</td>
            </tr>
        `).join('')}
        </tbody>
    </table></div>`;
}
window.renderWithdrawalHistory = renderWithdrawalHistory;

// ===================== SUBMIT WITHDRAWAL FROM INVESTMENT WALLET =====================
// WALLET RULE: withdrawable = 20% of invested amount (before completion)
//              withdrawable = full capital + profit (after completion)
function submitWithdrawalRequest() {
    const coin = document.getElementById('withdrawCoinSelect')?.value;
    const address = document.getElementById('withdrawDestAddress')?.value;
    const amountUsd = parseFloat(document.getElementById('withdrawUsdAmount')?.value) || 0;

    if (!coin) { showToast('Select a coin', 'error'); return; }
    if (!address) { showToast('Enter destination address', 'error'); return; }
    if (amountUsd <= 0) { showToast('Enter a valid amount', 'error'); return; }

    // MANDATORY RULE: Only 20% withdrawable before completion
    const withdrawable = getWithdrawableAmount(APP.currentUser.id);
    if (withdrawable <= 0) {
        showToast('No withdrawable balance. Your investment must be confirmed first.', 'error');
        return;
    }
    if (amountUsd > withdrawable) {
        const invs = getUserInvestmentsComputed(APP.currentUser.id);
        const hasCompleted = invs.some(i => i.status === 'completed');
        if (!hasCompleted) {
            showToast('Amount exceeds withdrawable limit. Only 20% of invested amount is available before your investment matures.', 'error');
        } else {
            showToast('Amount exceeds your available balance.', 'error');
        }
        return;
    }

    persistWithdrawalRecord({
        coin,
        coinType: coin,
        address,
        amount: amountUsd,
        amountUsd,
        status: 'Pending'
    });

    addTransaction({
        type: 'withdraw',
        currency: coin,
        amount: amountUsd,
        address,
        status: 'Pending'
    });

    showToast('Withdrawal request submitted. Pending admin review.', 'success');
    setTimeout(() => render(), 400);
}
window.submitWithdrawalRequest = submitWithdrawalRequest;

// ===================== ADMIN: VIEW RECEIPT =====================
function viewReceiptInModal(paymentId) {
    const payments = getInvestmentPayments();
    const p = payments.find(x => x.id === paymentId);
    if (!p) {
        showToast('Payment record not found', 'info');
        return;
    }

    // Support both receipt.dataUrl and top-level receiptFile
    const receiptDataUrl = (p.receipt && p.receipt.dataUrl) || p.receiptFile || '';
    const receiptName = (p.receipt && p.receipt.name) || p.name || 'receipt';
    const receiptType = (p.receipt && p.receipt.type) || '';
    const receiptSize = (p.receipt && p.receipt.size) || 0;

    if (!receiptDataUrl) {
        showToast('No receipt available for this payment', 'info');
        return;
    }

    // Create/reuse modal
    let m = document.getElementById('receiptViewModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'receiptViewModal';
        document.body.appendChild(m);
    }
    m.style.display = 'flex';

    const isPdf = receiptType === 'application/pdf' || (receiptName||'').endsWith('.pdf');

    m.innerHTML = `
        <div class="modal" onclick="if(event.target===this){document.getElementById('receiptViewModal').style.display='none';}">
            <div class="modal-content" style="max-width:700px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="font-size:20px; font-weight:800;">Receipt — ${receiptName}</h3>
                    <button onclick="document.getElementById('receiptViewModal').style.display='none'" style="width:32px;height:32px;border-radius:50%;background:var(--bg-secondary);border:none;cursor:pointer;font-size:20px;">×</button>
                </div>
                ${isPdf
                    ? `<iframe src="${receiptDataUrl}" style="width:100%;height:500px;border:none;border-radius:8px;"></iframe>`
                    : `<img src="${receiptDataUrl}" style="width:100%;border-radius:8px;max-height:500px;object-fit:contain;" alt="Receipt">`
                }
                <div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">
                    Submitted: ${formatDateTime(p.createdAt)} | Size: ${receiptSize ? (receiptSize/1024).toFixed(1)+'KB' : 'N/A'}
                </div>
            </div>
        </div>
    `;
}
window.viewReceiptInModal = viewReceiptInModal;

// ===================== ADMIN: APPROVE INVESTMENT (Direct from Users table) =====================
// Activates a user's investment directly from the Admin Dashboard.
// Sets investment.status = 'active', records startTime, then awards 20% referral bonus.
window.adminApproveInvestment = async function(userId) {
    if (!(typeof isSuperAdmin === 'function' && isSuperAdmin())) {
        showToast('Super Admin permission required', 'error');
        return;
    }

    const row = (window.__ADMIN_USERS_CACHE || []).find(function(u) {
        return u && String(u.id) === String(userId);
    });
    if (!row) {
        showToast('User not found in cache — try refreshing', 'error');
        return;
    }

    const inv    = row.investment || {};
    const amount = Number(inv.amount || 0);

    if (amount <= 0) {
        showToast('This user has no investment amount set. Ask them to submit a plan first.', 'error');
        return;
    }

    const invStatus = (inv.status || 'inactive');
    if (invStatus === 'active') {
        showToast('Investment is already active for this user.', 'info');
        return;
    }
    if (invStatus === 'completed') {
        showToast('Investment has already completed for this user.', 'info');
        return;
    }

    const now = Date.now();
    const updatedInvestment = Object.assign({}, inv, {
        amount:    amount,
        profit:    0,
        status:    'active',
        startTime: now,
        completed: false
    });

    try {
        // ---- 1. Activate investment in Supabase ----
        await window.sbUpdateUserById(userId, { investment: updatedInvestment });
        showToast('\u2705 Investment approved & activated for ' + (row.name || row.email), 'success');

        // ---- 2. Referral bonus: 20% of amount to referrer\'s wallet.balance ----
        const refBy = inv.referredBy
                   || (row.wallet && row.wallet.referredBy)
                   || null;

        if (refBy && window.sbFetchAllUsers && window.normalizeEmail) {
            const allUsers = await window.sbFetchAllUsers();
            const referrer = (allUsers || []).find(function(u) {
                return u && window.normalizeEmail(u.email) === window.normalizeEmail(refBy);
            });

            if (referrer) {
                const refBonus     = amount * 0.20;
                const currentBal   = Number((referrer.wallet && referrer.wallet.balance) || 0);
                const updatedWallet = Object.assign({}, (referrer.wallet || {}), {
                    balance: currentBal + refBonus
                });
                await window.sbUpdateUserById(referrer.id, { wallet: updatedWallet });
                showToast('Referral bonus of ' + formatCurrency(refBonus) + ' added to referrer (' + (referrer.email || '') + ')', 'info');
            }
        }

        // ---- 3. Reload admin users table ----
        if (typeof adminEnsureUsersLoaded === 'function') {
            await adminEnsureUsersLoaded();
        }

    } catch (err) {
        showToast('Failed to approve investment: ' + ((err && err.message) || 'Unknown error'), 'error');
    }
};
window.adminApproveInvestment = window.adminApproveInvestment;
