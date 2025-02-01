const supabase = require("../utils/supabase");

// Add these utility functions outside the UserProvider component
const checkCreditsAvailable = async (userId, requiredCredits) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('credits')
        .eq('user_id', userId)
        .single();
      
      if (error) throw error;
      return (data?.credits ?? 0) >= requiredCredits;
    } catch (error) {
      console.error('Error checking credits:', error);
      return false;
    }
};
  
const handleCreditTransaction = async (transaction) => {
    const { type, amount, reason, user_id } = transaction;
  
    try {
      // Start a Supabase transaction
      const { data: { credits: currentCredits } = { credits: 0 }, error: fetchError } = await supabase
        .from('users')
        .select('credits')
        .eq('user_id', user_id)
        .single();
  
      if (fetchError) throw fetchError;
  
      // Calculate new credit balance
      const newCredits = type === 'credit' 
        ? (currentCredits + amount)
        : (currentCredits - amount);
  
      // If it's a debit transaction, check if user has enough credits
      if (type === 'debit' && newCredits < 0) {
        throw new Error('Insufficient credits');
      }
  
      // Update user's credits
      const { error: updateError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('user_id', user_id);
  
      if (updateError) throw updateError;
  
      // Log the transaction
      const { error: logError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id,
          type,
          amount,
          reason,
          created_at: new Date().toISOString(),
          previous_balance: currentCredits,
          new_balance: newCredits
        });
  
      if (logError) throw logError;
  
      return true;
    } catch (error) {
      console.error('Credit transaction failed:', error);
      return false;
    }
};

module.exports = {
    checkCreditsAvailable,
    handleCreditTransaction
};