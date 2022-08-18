// @ts-check
const { Scenes } = require('telegraf');
const CommunityModule = require('../modules/community');
const OrdersModule = require('../modules/orders');
const {
  addInvoiceWizard,
  addFiatAmountWizard
} = require('../scenes');

exports.stageMiddleware = () => {
  const scenes = [
    addInvoiceWizard,
    addFiatAmountWizard,
    CommunityModule.Scenes.communityWizard,
    CommunityModule.Scenes.updateNameCommunityWizard,
    CommunityModule.Scenes.updateGroupCommunityWizard,
    CommunityModule.Scenes.updateCurrenciesCommunityWizard,
    CommunityModule.Scenes.updateChannelsCommunityWizard,
    CommunityModule.Scenes.updateSolversCommunityWizard,
    CommunityModule.Scenes.updateFeeCommunityWizard,
    CommunityModule.Scenes.updateDisputeChannelCommunityWizard,
    CommunityModule.Scenes.addEarningsInvoiceWizard,
    OrdersModule.Scenes.createOrder
  ];
  scenes.forEach(addGenericCommands);
  const stage = new Scenes.Stage(scenes, {
    ttl: 1200, // All wizards live 20 minutes
  });
  return stage.middleware();
};

function addGenericCommands(scene) {
  scene.command('exit', async ctx => {
    await ctx.scene.leave();
    const text = ctx.i18n.t('wizard_exit');
    await ctx.reply(text);
  });
  scene.command('help', async ctx => {
    const text = ctx.i18n.t('wizard_help');
    await ctx.reply(text);
  });
  return scene;
}
