# Attention Is All You Need

> **Authors:** Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin  
> **Affiliations:** Google Brain & Google Research, University of Toronto  
> **Publication:** 31st Conference on Neural Information Processing Systems (NeurIPS 2017)

---

## Abstract

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the **Transformer**, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves **28.4 BLEU** on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of **41.8** after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature.[^1]

---

## 1 Introduction

Recurrent neural networks, long short-term memory[^2] and gated recurrent[^3] neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation[^4][^5]. Numerous efforts have since continued to push the boundaries of recurrent language models and encoder-decoder architectures[^6][^7].

Recurrent models typically factor computation along the symbol positions of the input and output sequences. Aligning the positions to steps in computation time, they generate a sequence of hidden states h_t, as a function of the previous hidden state h_{t−1} and the input for position t. This inherently sequential nature precludes parallelization within training examples, which becomes critical at longer sequence lengths, as memory constraints limit batching across examples.

Attention mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks, allowing modeling of dependencies without regard to their distance in the input or output sequences[^5][^8]. In all but a few cases, however, such attention mechanisms are used in conjunction with a recurrent network.

In this work we propose the **Transformer**, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output. The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality after being trained for as little as twelve hours on eight P100 GPUs.

---

## 2 Background

The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU[^9], ByteNet[^10] and ConvS2S[^11], all of which use convolutional neural networks as basic building block, computing hidden representations in parallel for all input and output positions. In these models, the number of operations required to relate signals from two arbitrary input or output positions grows in the distance between positions, linearly for ConvS2S and logarithmically for ByteNet. This makes it more difficult to learn dependencies between distant positions. In the Transformer this is reduced to a constant number of operations, albeit at the cost of reduced effective resolution due to averaging attention-weighted positions, an effect we counteract with Multi-Head Attention as described in Section 3.2.

Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence. Self-attention has been used successfully in a variety of tasks including reading comprehension, abstractive summarization, textual entailment and learning task-independent sentence representations[^12].

To the best of our knowledge, however, the Transformer is the first transduction model relying entirely on self-attention to compute representations of its input and output without using sequence-aligned RNNs or convolution.

---

## 3 Model Architecture

Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations (x₁, …, xₙ) to a sequence of continuous representations **z** = (z₁, …, zₙ). Given **z**, the decoder then generates an output sequence (y₁, …, yₘ) of symbols one element at a time. At each step the model is auto-regressive, consuming the previously generated symbols as additional input when generating the next.

The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder.

### 3.1 Encoder and Decoder Stacks

**Encoder:** The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization. That is, the output of each sub-layer is LayerNorm(x + Sublayer(x)), where Sublayer(x) is the function implemented by the sub-layer itself. To facilitate these residual connections, all sub-layers in the model, as well as the embedding layers, produce outputs of dimension d_model = 512.

**Decoder:** The decoder is also composed of a stack of N = 6 identical layers. In addition to the two sub-layers in each encoder layer, the decoder inserts a third sub-layer, which performs multi-head attention over the output of the encoder stack. Similar to the encoder, we employ residual connections around each of the sub-layers, followed by layer normalization. We also modify the self-attention sub-layer in the decoder stack to prevent positions from attending to subsequent positions. This masking, combined with fact that the output embeddings are offset by one position, ensures that the predictions for position i can depend only on the known outputs at positions less than i.

### 3.2 Attention

An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.

### 3.2.1 Scaled Dot-Product Attention

We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys of dimension d_k, and values of dimension d_v. We compute the dot products of the query with all keys, divide each by √d_k, and apply a softmax function to obtain the weights on the values.

<!-- @var-region -->
$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$
<!-- @var-defs
Q: Query matrix — packed queries (shape: seq_len × d_k)
K: Key matrix — packed keys (shape: seq_len × d_k)
V: Value matrix — packed values (shape: seq_len × d_v)
d_k: Dimension of key and query vectors (d_k = 64)
d_v: Dimension of value vectors (d_v = 64)
-->

The two most commonly used attention functions are additive attention[^5], and dot-product (multiplicative) attention. Dot-product attention is identical to our algorithm, except for the scaling factor of 1/√d_k.

While for small values of d_k the two mechanisms perform similarly, additive attention outperforms dot product attention without scaling for larger values of d_k. We suspect that for large values of d_k, the dot products grow large in magnitude, pushing the softmax function into regions where it has extremely small gradients. To counteract this effect, we scale the dot products by 1/√d_k.

### 3.2.2 Multi-Head Attention

Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to d_k, d_k and d_v dimensions, respectively. On each of these projected versions of queries, keys and values we then perform the attention function in parallel, yielding d_v-dimensional output values. These are concatenated and once again projected, resulting in the final values.

<!-- @var-region -->
$$\text{MultiHead}(Q, K, V) = \text{Concat}(head_1, \ldots, head_h)W^O$$

$$\text{where } head_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$
<!-- @var-defs
h: Number of parallel attention heads (h = 8)
W_i^Q: Query projection matrix for head i (d_model × d_k)
W_i^K: Key projection matrix for head i (d_model × d_k)
W_i^V: Value projection matrix for head i (d_model × d_v)
W^O: Output projection matrix (h·d_v × d_model)
d_model: Model embedding dimension (d_model = 512)
-->

In this work we employ h = 8 parallel attention heads. For each of these we use d_k = d_v = d_model/h = 64. Due to the reduced dimension of each head, the total computational cost is similar to that of single-head attention with full dimensionality.

### 3.3 Position-wise Feed-Forward Networks

In addition to attention sub-layers, each of the layers in our encoder and decoder contains a fully connected feed-forward network, which is applied to each position separately and identically. This consists of two linear transformations with a ReLU activation in between.

<!-- @var-region -->
$$\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$$
<!-- @var-defs
x: Input vector at each position (dimension d_model = 512)
W_1: First linear transformation weight matrix (d_model × d_ff)
W_2: Second linear transformation weight matrix (d_ff × d_model)
b_1: First bias vector
b_2: Second bias vector
d_ff: Feed-forward inner dimension (d_ff = 2048)
-->

While the linear transformations are the same across different positions, they use different parameters from layer to layer. The dimensionality of input and output is d_model = 512, and the inner-layer has dimensionality d_ff = 2048.

### 3.4 Embeddings and Softmax

Similarly to other sequence transduction models, we use learned embeddings to convert the input tokens and output tokens to vectors of dimension d_model. We also use the usual learned linear transformation and softmax function to convert the decoder output to predicted next-token probabilities. In our model, we share the same weight matrix between the two embedding layers and the pre-softmax linear transformation. In the embedding layers, we multiply those weights by √d_model.

### 3.5 Positional Encoding

Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information about the relative or absolute position of the tokens in the sequence. To this end, we add "positional encodings" to the input embeddings at the bottoms of the encoder and decoder stacks. The positional encodings have the same dimension d_model as the embeddings, so that the two can be summed. We use sine and cosine functions of different frequencies:

<!-- @var-region -->
$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$
<!-- @var-defs
PE: Positional encoding matrix added to token embeddings
pos: Position of the token in the sequence (0-indexed)
i: Dimension index within the positional encoding vector
d_model: Model embedding dimension (512)
-->

where pos is the position and i is the dimension. That is, each dimension of the positional encoding corresponds to a sinusoid. The wavelengths form a geometric progression from 2π to 10000 · 2π. We chose this function because we hypothesized it would allow the model to easily learn to attend by relative positions, since for any fixed offset k, PE_{pos+k} can be represented as a linear function of PE_{pos}.

---

## 4 Why Self-Attention

In this section we compare various aspects of self-attention layers to the recurrent and convolutional layers commonly used for mapping one variable-length sequence of symbol representations to another sequence of equal length. We consider three desiderata:

1. Total computational complexity per layer.
2. Amount of computation that can be parallelized, as measured by the minimum number of sequential operations required.
3. Path length between long-range dependencies in the network.

| Layer Type | Complexity per Layer | Sequential Ops | Max Path Length |
|---|---|---|---|
| Self-Attention | O(n² · d) | O(1) | O(1) |
| Recurrent | O(n · d²) | O(n) | O(n) |
| Convolutional | O(k · n · d²) | O(1) | O(log_k(n)) |
| Self-Attention (restricted) | O(r · n · d) | O(1) | O(n/r) |

---

## 5 Training

### 5.1 Training Data and Batching

We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs. Sentences were encoded using byte-pair encoding, which has a shared source-target vocabulary of about 37000 tokens. For English-French, we used the significantly larger WMT 2014 English-French dataset consisting of 36M sentences and split tokens into a 32000 word-piece vocabulary. Sentence pairs were batched together by approximate sequence length. Each training batch contained a set of sentence pairs containing approximately 25000 source tokens and 25000 target tokens.

### 5.2 Hardware and Schedule

We trained our models on one machine with 8 NVIDIA P100 GPUs. For our base models using the hyperparameters described throughout the paper, each training step took about 0.4 seconds. We trained the base models for a total of 100,000 steps or 12 hours. For our big models, step time was 1.0 seconds. The big models were trained for 300,000 steps (3.5 days).

### 5.3 Optimizer

We used the Adam optimizer[^13] with β₁ = 0.9, β₂ = 0.98 and ε = 10⁻⁹. We varied the learning rate over the course of training, according to the formula:

<!-- @var-region -->
$$lrate = d_{model}^{-0.5} \cdot \min(step\_num^{-0.5},\ step\_num \cdot warmup\_steps^{-1.5})$$
<!-- @var-defs
lrate: Learning rate at the current training step
d_model: Model dimension (512); controls the base scale of the learning rate
step_num: Current training step number
warmup_steps: Number of warmup steps (warmup_steps = 4000); learning rate increases linearly then decays
-->

This corresponds to increasing the learning rate linearly for the first warmup_steps training steps, and decreasing it thereafter proportionally to the inverse square root of the step number. We used warmup_steps = 4000.

### 5.4 Regularization

We employ three types of regularization during training:

1. **Residual Dropout** — We apply dropout to the output of each sub-layer, before it is added to the sub-layer input and normalized. In addition, we apply dropout to the sums of the embeddings and the positional encodings in both the encoder and decoder stacks. For the base model, we use a rate of P_drop = 0.1.
2. **Label Smoothing** — During training, we employed label smoothing of value ε_ls = 0.1.[^14] This hurts perplexity, as the model learns to be more unsure, but improves accuracy and BLEU score.

---

## 6 Results

### 6.1 Machine Translation

On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models (including ensembles) by more than 2.0 BLEU, establishing a new state-of-the-art BLEU score of **28.4**.

| Model | EN-DE BLEU | EN-FR BLEU | Training Cost (FLOPs) |
|---|---|---|---|
| ByteNet[^10] | 23.75 | — | — |
| Deep-Att + PosUnk[^8] | — | 39.2 | 1.0 × 10²⁰ |
| GNMT + RL[^6] | 24.6 | 39.92 | 2.3 × 10¹⁹ |
| ConvS2S[^11] | 25.16 | 40.46 | 1.5 × 10²⁰ |
| MoE[^15] | 26.03 | 40.56 | 1.2 × 10²⁰ |
| **Transformer (base)** | 27.3 | 38.1 | **3.3 × 10¹⁸** |
| **Transformer (big)** | **28.4** | **41.8** | 2.3 × 10¹⁹ |

On the WMT 2014 English-to-French translation task, our big model achieves a BLEU score of **41.0**, outperforming all of the previously published single models, at less than 1/4 the training cost of the previous state-of-the-art model.

### 6.2 Model Variations

| | N | d_model | d_ff | h | d_k | d_v | P_drop | EN-DE BLEU |
|---|---|---|---|---|---|---|---|---|
| base | 6 | 512 | 2048 | 8 | 64 | 64 | 0.1 | 27.3 |
| (A) | 6 | 512 | 2048 | 1 | 512 | 512 | 0.1 | 24.9 |
| | 6 | 512 | 2048 | 4 | 128 | 128 | 0.1 | 25.5 |
| | 6 | 512 | 2048 | 16 | 32 | 32 | 0.1 | 25.8 |
| | 6 | 512 | 2048 | 32 | 16 | 16 | 0.1 | 24.9 |
| (B) | 6 | 512 | 2048 | 16 | 16 | 16 | 0.1 | 25.4 |
| (D) | 6 | 512 | 2048 | 8 | 64 | 64 | 0.0 | 26.4 |
| | 6 | 512 | 2048 | 8 | 64 | 64 | 0.2 | 27.1 |
| big | 6 | 1024 | 4096 | 16 | 64 | 64 | 0.3 | **28.4** |

---

## 7 Conclusion

In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention.[^1]

For translation tasks, the Transformer can be trained significantly faster than architectures based on recurrent or convolutional layers. On both WMT 2014 English-to-German and WMT 2014 English-to-French translation tasks, we achieve a new state of the art. In the former task our best model outperforms even all previously reported ensembles.

We are excited about the future of attention-based models and plan to apply them to other tasks. We plan to extend the Transformer to problems involving input and output modalities other than text and to investigate local, restricted attention mechanisms to efficiently handle large inputs and outputs such as images, audio and video. Making generation less sequential is another research goal of ours.

---

<!-- @references -->
[^1]: title="Attention Is All You Need" url="https://arxiv.org/abs/1706.03762" quote="We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely."
[^2]: title="Long Short-Term Memory" url="https://doi.org/10.1162/neco.1997.9.8.1735" quote="A novel recurrent net architecture that can learn to bridge minimal time lags in excess of 1000 discrete-time steps."
[^3]: title="Empirical Evaluation of Gated Recurrent Neural Networks on Sequence Modeling" url="https://arxiv.org/abs/1412.3555" quote="We compare different types of recurrent units in recurrent neural networks."
[^4]: title="Sequence to Sequence Learning with Neural Networks" url="https://arxiv.org/abs/1409.3215" quote="We present a general end-to-end approach to sequence learning that makes minimal assumptions on the sequence structure."
[^5]: title="Neural Machine Translation by Jointly Learning to Align and Translate" url="https://arxiv.org/abs/1409.0473" quote="We conjecture that the use of a fixed-length vector is a bottleneck in improving the performance of this basic encoder-decoder architecture."
[^6]: title="Google's Neural Machine Translation System" url="https://arxiv.org/abs/1609.08144" quote="Our model consists of a deep LSTM network with 8 encoder and 8 decoder layers."
[^7]: title="Exploring the Limits of Language Modeling" url="https://arxiv.org/abs/1602.02410" quote="We explore recent advances in recurrent neural network based language models."
[^8]: title="Effective Approaches to Attention-based Neural Machine Translation" url="https://arxiv.org/abs/1508.04025" quote="We examine two simple and effective classes of attentional mechanism."
[^9]: title="Can Active Memory Replace Attention?" url="https://arxiv.org/abs/1610.08613" quote="We investigate whether attention can be replaced by a memory mechanism."
[^10]: title="Neural Machine Translation in Linear Time" url="https://arxiv.org/abs/1610.10099" quote="We present ByteNet, a neural translation model with linear running time."
[^11]: title="Convolutional Sequence to Sequence Learning" url="https://arxiv.org/abs/1705.03122" quote="We introduce an architecture based entirely on convolutional neural networks."
[^12]: title="A Decomposable Attention Model for Natural Language Inference" url="https://arxiv.org/abs/1606.01933" quote="We propose a simple neural architecture for natural language inference."
[^13]: title="Adam: A Method for Stochastic Optimization" url="https://arxiv.org/abs/1412.6980" quote="We introduce Adam, an algorithm for first-order gradient-based optimization of stochastic objective functions."
[^14]: title="Rethinking the Inception Architecture for Computer Vision" url="https://arxiv.org/abs/1512.00567" quote="Label smoothing is a mechanism for regularizing the classifier layer."
[^15]: title="Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer" url="https://arxiv.org/abs/1701.06538" quote="We introduce a sparsely-gated mixture of experts layer."
